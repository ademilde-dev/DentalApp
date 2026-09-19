-- ============================================================================
-- DentalApp — Migração inicial do schema (T2 do design)
-- Design: docs/designs/fabio-main-design-20260918-2150.md
-- ----------------------------------------------------------------------------
-- Escopo:
--   1. Tabelas relacionais (migração Firestore → Postgres, decisão D2):
--      pacientes | procedimentos | dentistas | consultas | retornos | perfis
--   2. Trigger idempotente de recall + unique parcial (decisão 1A)
--   3. RLS com roles recepcionista/dentista (decisão 2A)
--   4. Views hoje/amanhã/semana em America/Sao_Paulo (decisão 4A)
--   5. Campos para os edge cases 6A (sem telefone, cancelada fora da lista,
--      contatada 14+ dias → badge "recontatar")
--
-- Como rodar: Supabase Dashboard → SQL Editor (colar e executar) ou
--   `supabase db push` (CLI). Reexecutável (idempotente) para re-runs manuais.
--
-- Notas:
--   - consultas.data é timestamptz (decisão 4A); toda aritmética de datas usa
--     AT TIME ZONE 'America/Sao_Paulo'.
--   - perfis/dentistas referenciam auth.users (Supabase Auth, decisão 2A).
--     Em Postgres puro (sem Supabase), a FK é omitida para permitir testes locais.
--   - Nenhum seed de dados aqui — o seed retroativo é a tarefa T3.
--   - A RPC carregar_painel() (decisão 8A) está em 0002_views_rpc.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS
-- ----------------------------------------------------------------------------

create table if not exists public.pacientes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  telefone      text,
  alertas_saude jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now()
);
comment on table public.pacientes is
  'Cadastro de pacientes. alertas_saude: {alergias, hipertensao, diabetes, medicacoes, observacoes}';

create table if not exists public.procedimentos (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  janela_retorno_dias int not null default 180 check (janela_retorno_dias >= 0),
  criado_em           timestamptz not null default now()
);
comment on column public.procedimentos.janela_retorno_dias is
  'Dias até o recall de retorno (default 180 — zero tela de configuração na v1)';

create table if not exists public.dentistas (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  user_id   uuid unique,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);
-- FK para auth.users somente quando o schema auth existe (Supabase)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    execute 'alter table public.dentistas
               add constraint dentistas_user_id_fkey
               foreign key (user_id) references auth.users(id) on delete set null';
  end if;
end $$;

create table if not exists public.consultas (
  id              uuid primary key default gen_random_uuid(),
  paciente_id     uuid not null references public.pacientes(id) on delete cascade,
  procedimento_id uuid references public.procedimentos(id) on delete set null,
  dentista_id     uuid references public.dentistas(id) on delete set null,
  data            timestamptz not null,
  status          text not null default 'agendada'
                  check (status in ('agendada','confirmada','concluida','faltou','cancelada')),
  criado_em       timestamptz not null default now()
);
comment on column public.consultas.status is
  'agendada | confirmada | concluida | faltou | cancelada';

create table if not exists public.retornos (
  id                 uuid primary key default gen_random_uuid(),
  paciente_id        uuid not null references public.pacientes(id) on delete cascade,
  consulta_origem_id uuid references public.consultas(id) on delete cascade,
  elegivel_apos      date not null,
  status             text not null default 'pendente'
                     check (status in ('pendente','contatado','reagendado','sem_interesse')),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
comment on column public.retornos.status is
  'pendente | contatado | reagendado | sem_interesse';

create table if not exists public.perfis (
  user_id   uuid primary key,
  role      text not null check (role in ('recepcionista','dentista')),
  criado_em timestamptz not null default now()
);
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    execute 'alter table public.perfis
               add constraint perfis_user_id_fkey
               foreign key (user_id) references auth.users(id) on delete cascade';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) ÍNDICES — as duas queries do Painel do Dia + unique parcial (1A)
-- ----------------------------------------------------------------------------
create index if not exists consultas_data_status_idx
  on public.consultas (data, status);
create index if not exists consultas_paciente_idx
  on public.consultas (paciente_id);
create index if not exists retornos_status_elegivel_idx
  on public.retornos (status, elegivel_apos);
create index if not exists retornos_paciente_idx
  on public.retornos (paciente_id);

-- 1A: garante no máximo um retorno pendente por paciente
create unique index if not exists retornos_paciente_pendente_uidx
  on public.retornos (paciente_id)
  where status = 'pendente';

-- ----------------------------------------------------------------------------
-- 3) atualizado_em automático em retornos
-- ----------------------------------------------------------------------------
create or replace function public.fn_set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists retornos_atualizado_em_trg on public.retornos;
create trigger retornos_atualizado_em_trg
before update on public.retornos
for each row
execute function public.fn_set_atualizado_em();

-- ----------------------------------------------------------------------------
-- 4) TRIGGER DE RECALL — decisão 1A (idempotente + unique parcial)
--    concluida (insert ou transição) → insere/renova o retorno pendente,
--      reestendendo elegivel_apos = data(SP) + janela do procedimento (default 180)
--    reversão (deixou de ser concluida) → anula (remove) o retorno pendente
--      originado desta consulta
--    SECURITY DEFINER: a escrita em retornos é do sistema (bypass RLS) — sem
--    isso, o dentista (leitura + concluir, 2A) não conseguiria gerar o retorno
--    ao concluir a consulta.
-- ----------------------------------------------------------------------------
create or replace function public.fn_gerenciar_retorno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_janela   int;
  v_elegivel date;
begin
  -- Nova conclusão (INSERT — old.status é NULL — ou transição para 'concluida')
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    select pr.janela_retorno_dias
      into v_janela
      from public.procedimentos pr
     where pr.id = new.procedimento_id;

    v_elegivel := (new.data at time zone 'America/Sao_Paulo')::date
                  + coalesce(v_janela, 180);

    -- Upsert idempotente: no máximo 1 retorno pendente por paciente (1A)
    insert into public.retornos (paciente_id, consulta_origem_id, elegivel_apos, status)
    values (new.paciente_id, new.id, v_elegivel, 'pendente')
    on conflict (paciente_id) where status = 'pendente'
    do update
      set consulta_origem_id = excluded.consulta_origem_id,
          elegivel_apos      = excluded.elegivel_apos,
          atualizado_em      = now();

  -- Reversão (a consulta deixou de estar 'concluida')
  elsif old.status = 'concluida' and new.status is distinct from 'concluida' then
    delete from public.retornos r
     where r.consulta_origem_id = new.id
       and r.status = 'pendente';
  end if;

  return new;
end;
$$;

drop trigger if exists consultas_retorno_trg on public.consultas;
create trigger consultas_retorno_trg
after insert or update of status on public.consultas
for each row
execute function public.fn_gerenciar_retorno();

-- ----------------------------------------------------------------------------
-- 5) RLS — decisão 2A: recepcionista (tudo) | dentista (leitura + concluir)
--    Policies checam auth.uid() via fn_role_usuario() (SECURITY DEFINER: lê
--    perfis sem expor a tabela). Sem perfil/role → nega por default.
-- ----------------------------------------------------------------------------
create or replace function public.fn_role_usuario()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.perfis p where p.user_id = (select auth.uid()) limit 1;
$$;

alter table public.pacientes     enable row level security;
alter table public.procedimentos enable row level security;
alter table public.dentistas     enable row level security;
alter table public.consultas     enable row level security;
alter table public.retornos      enable row level security;
alter table public.perfis        enable row level security;

-- perfis: cada usuário lê o próprio perfil; escrita só via service_role (T4)
drop policy if exists perfis_leitura_proprio on public.perfis;
create policy perfis_leitura_proprio
  on public.perfis for select to authenticated
  using (user_id = (select auth.uid()));

-- recepcionista = tudo (2A)
drop policy if exists pacientes_recepcionista_all on public.pacientes;
create policy pacientes_recepcionista_all
  on public.pacientes for all to authenticated
  using (public.fn_role_usuario() = 'recepcionista')
  with check (public.fn_role_usuario() = 'recepcionista');

drop policy if exists pacientes_dentista_leitura on public.pacientes;
create policy pacientes_dentista_leitura
  on public.pacientes for select to authenticated
  using (public.fn_role_usuario() = 'dentista');

drop policy if exists procedimentos_recepcionista_all on public.procedimentos;
create policy procedimentos_recepcionista_all
  on public.procedimentos for all to authenticated
  using (public.fn_role_usuario() = 'recepcionista')
  with check (public.fn_role_usuario() = 'recepcionista');

drop policy if exists procedimentos_dentista_leitura on public.procedimentos;
create policy procedimentos_dentista_leitura
  on public.procedimentos for select to authenticated
  using (public.fn_role_usuario() = 'dentista');

drop policy if exists dentistas_recepcionista_all on public.dentistas;
create policy dentistas_recepcionista_all
  on public.dentistas for all to authenticated
  using (public.fn_role_usuario() = 'recepcionista')
  with check (public.fn_role_usuario() = 'recepcionista');

drop policy if exists dentistas_dentista_leitura on public.dentistas;
create policy dentistas_dentista_leitura
  on public.dentistas for select to authenticated
  using (public.fn_role_usuario() = 'dentista');

drop policy if exists consultas_recepcionista_all on public.consultas;
create policy consultas_recepcionista_all
  on public.consultas for all to authenticated
  using (public.fn_role_usuario() = 'recepcionista')
  with check (public.fn_role_usuario() = 'recepcionista');

drop policy if exists consultas_dentista_leitura on public.consultas;
create policy consultas_dentista_leitura
  on public.consultas for select to authenticated
  using (public.fn_role_usuario() = 'dentista');

-- "concluir": dentista também atualiza consultas (status concluida/cancelada — 2A)
drop policy if exists consultas_dentista_concluir on public.consultas;
create policy consultas_dentista_concluir
  on public.consultas for update to authenticated
  using (public.fn_role_usuario() = 'dentista')
  with check (public.fn_role_usuario() = 'dentista');

drop policy if exists retornos_recepcionista_all on public.retornos;
create policy retornos_recepcionista_all
  on public.retornos for all to authenticated
  using (public.fn_role_usuario() = 'recepcionista')
  with check (public.fn_role_usuario() = 'recepcionista');

drop policy if exists retornos_dentista_leitura on public.retornos;
create policy retornos_dentista_leitura
  on public.retornos for select to authenticated
  using (public.fn_role_usuario() = 'dentista');

-- ----------------------------------------------------------------------------
-- 6) VIEWS — decisão 4A (fuso America/Sao_Paulo, cálculo 100% no banco)
--    security_invoker: as views respeitam a RLS do chamador (dado de saúde).
--    Edge cases 6A expostos para a UI:
--      - tem_telefone = false → botão "cadastrar telefone" (wa.me oculto)
--      - cancelada excluída das listas
--      - recontatar = true → badge "recontatar" (contatada há 14+ dias)
-- ----------------------------------------------------------------------------
create or replace view public.vw_agenda_hoje
with (security_invoker = true) as
select
  c.id                         as consulta_id,
  c.data                       as data,
  to_char(c.data at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as data_sp,
  to_char(c.data at time zone 'America/Sao_Paulo', 'HH24:MI')    as hora_sp,
  c.status,
  d.id                         as dentista_id,
  d.nome                       as dentista_nome,
  pr.nome                      as procedimento_nome,
  p.id                         as paciente_id,
  p.nome                       as paciente_nome,
  p.telefone                   as telefone,
  coalesce(nullif(trim(p.telefone), ''), '') <> '' as tem_telefone,
  p.alertas_saude              as alertas_saude
from public.consultas c
join public.pacientes p           on p.id = c.paciente_id
left join public.dentistas d      on d.id = c.dentista_id
left join public.procedimentos pr on pr.id = c.procedimento_id
where (c.data at time zone 'America/Sao_Paulo')::date
        = (now() at time zone 'America/Sao_Paulo')::date
  and c.status <> 'cancelada';  -- 6A: cancelada some da lista

create or replace view public.vw_confirmacoes_amanha
with (security_invoker = true) as
select
  c.id                         as consulta_id,
  c.data                       as data,
  to_char(c.data at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as data_sp,
  to_char(c.data at time zone 'America/Sao_Paulo', 'HH24:MI')    as hora_sp,
  c.status,
  d.nome                       as dentista_nome,
  pr.nome                      as procedimento_nome,
  p.id                         as paciente_id,
  p.nome                       as paciente_nome,
  p.telefone                   as telefone,
  coalesce(nullif(trim(p.telefone), ''), '') <> '' as tem_telefone,
  p.alertas_saude              as alertas_saude
from public.consultas c
join public.pacientes p           on p.id = c.paciente_id
left join public.dentistas d      on d.id = c.dentista_id
left join public.procedimentos pr on pr.id = c.procedimento_id
where (c.data at time zone 'America/Sao_Paulo')::date
        = ((now() at time zone 'America/Sao_Paulo')::date + 1)
  and c.status in ('agendada', 'confirmada');  -- 6A: cancelada/concluida/faltou fora

create or replace view public.vw_reativacoes_semana
with (security_invoker = true) as
select
  r.id                         as retorno_id,
  r.paciente_id,
  p.nome                       as paciente_nome,
  p.telefone                   as telefone,
  coalesce(nullif(trim(p.telefone), ''), '') <> '' as tem_telefone,
  p.alertas_saude              as alertas_saude,
  r.elegivel_apos,
  r.status                     as retorno_status,
  r.atualizado_em,
  r.consulta_origem_id,
  co.data                      as consulta_origem_data,
  to_char(co.data at time zone 'America/Sao_Paulo', 'DD/MM/YYYY') as consulta_origem_data_sp,
  pr.nome                      as procedimento_nome,
  (r.status = 'contatado' and r.atualizado_em < now() - interval '14 days') as recontatar
from public.retornos r
join public.pacientes p           on p.id = r.paciente_id
left join public.consultas co     on co.id = r.consulta_origem_id
left join public.procedimentos pr on pr.id = co.procedimento_id
where r.status in ('pendente', 'contatado')  -- 6A: reagendado/sem_interesse fora
  and r.elegivel_apos <= ((now() at time zone 'America/Sao_Paulo')::date
       + (7 - extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int))
order by r.elegivel_apos, p.nome;

-- ============================================================================
-- FIM 0001_init.sql
-- ============================================================================

