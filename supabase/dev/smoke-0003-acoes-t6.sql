-- ============================================================================
-- DentalApp — Smoke test da T6 (ações de status da agenda → recall 1A)
-- Design: docs/designs/fabio-main-design-20260918-2150.md (decisões 1A e 2A)
-- ----------------------------------------------------------------------------
-- COMO USAR: SQL Editor do Supabase, APÓS rodar 0001, 0002 e 0003.
-- 100% transacional: ROLLBACK no fim — nenhum dado persiste.
--
-- O que este script prova (o que a T6 precisa garantir de verdade):
--   1. Recepção concluir uma consulta → retorno pendente criado com a janela
--      do procedimento (elegivel_apos = data SP + janela_retorno_dias).
--   2. Cancelar depois de concluir anula o retorno pendente (reversão 1A).
--   3. Concluir de novo REUSA/estende o mesmo retorno (idempotência: nunca
--      dois pendentes para o mesmo paciente).
--   4. DENTISTA pode concluir (policy consultas_dentista_concluir) e o retorno
--      É criado para ele — o trigger é SECURITY DEFINER e escreve com os
--      privilégios do dono, mesmo o dentista sendo só leitura em `retornos`.
--   5. O retorno do dentista aparece em reativacoes_semana (RPC 8A) e a
--      consulta cancelada some da agenda de hoje (6A).
--
-- Qualquer "SMOKE FALHOU" aborta o script (e o rollback desfaz tudo).
-- ============================================================================

begin;

-- Cenário: dois pacientes, uma consulta de hoje para cada, mesmo procedimento
-- Janela 0 de propósito: elegivel_apos = hoje, que é o único valor capaz de
-- aparecer em reativacoes_semana (a view lista só até o fim da semana atual).
-- O cálculo com janela > 0 é conferido na seção 2b, num paciente só.
insert into public.procedimentos (id, nome, janela_retorno_dias)
values ('00000000-0000-0000-0000-0000000000d1', 'Restauração (smoke T6)', 0);

insert into public.pacientes (id, nome, telefone)
values ('00000000-0000-0000-0000-0000000000e1', 'Ana Teste T6', '(31) 98888-7777'),
       ('00000000-0000-0000-0000-0000000000e2', 'Bruno Teste T6', '(31) 97777-6666');

-- T6C1: consulta de HOJE às 15:00 (SP), procedimento com janela de 180 dias
insert into public.consultas (id, paciente_id, procedimento_id, data, status)
values ('00000000-0000-0000-0000-0000000000f1',
        '00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000d1',
        (((now() at time zone 'America/Sao_Paulo')::date)::text || ' 15:00')::timestamp
          at time zone 'America/Sao_Paulo',
        'agendada');

-- T6C2: consulta de HOJE às 16:00 (SP) — usada no teste do DENTISTA
insert into public.consultas (id, paciente_id, procedimento_id, data, status)
values ('00000000-0000-0000-0000-0000000000f2',
        '00000000-0000-0000-0000-0000000000e2',
        '00000000-0000-0000-0000-0000000000d1',
        (((now() at time zone 'America/Sao_Paulo')::date)::text || ' 16:00')::timestamp
          at time zone 'America/Sao_Paulo',
        'confirmada');

-- --------------------------------------------------------------------------
-- 1) Recepção conclui → retorno criado com a janela do procedimento
-- --------------------------------------------------------------------------
update public.consultas set status = 'concluida'
 where id = '00000000-0000-0000-0000-0000000000f1';

do $$
declare
  v_janela date;
  v_status text;
begin
  select r.elegivel_apos, r.status into v_janela, v_status
    from public.retornos r
   where r.paciente_id = '00000000-0000-0000-0000-0000000000e1';

  if v_janela is null then
    raise exception 'SMOKE FALHOU (1A): concluir a consulta não criou o retorno pendente';
  end if;
  if v_status <> 'pendente' then
    raise exception 'SMOKE FALHOU (1A): retorno criado com status % (esperado pendente)', v_status;
  end if;
  if v_janela <> ((now() at time zone 'America/Sao_Paulo')::date + 0) then
    raise exception 'SMOKE FALHOU (1A): elegivel_apos % (esperado hoje, janela 0)', v_janela;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 2) Reversão: cancelar a consulta concluída anula o retorno pendente
-- --------------------------------------------------------------------------
update public.consultas set status = 'cancelada'
 where id = '00000000-0000-0000-0000-0000000000f1';

do $$
begin
  if exists (
    select 1 from public.retornos
     where paciente_id = '00000000-0000-0000-0000-0000000000e1'
       and status = 'pendente'
  ) then
    raise exception 'SMOKE FALHOU (1A): cancelar a consulta deveria anular o retorno pendente';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 2b) Cálculo da janela > 0: procedimento de 180 dias → elegivel_apos = +180
--     (paciente próprio, para não poluir as listas de Ana e Bruno)
-- --------------------------------------------------------------------------
insert into public.procedimentos (id, nome, janela_retorno_dias)
values ('00000000-0000-0000-0000-0000000000d2', 'Ortodontia (smoke T6, janela 180)', 180);

insert into public.pacientes (id, nome, telefone)
values ('00000000-0000-0000-0000-0000000000e3', 'Carla Teste T6', '(31) 96666-5555');

insert into public.consultas (id, paciente_id, procedimento_id, data, status)
values ('00000000-0000-0000-0000-0000000000f3',
        '00000000-0000-0000-0000-0000000000e3',
        '00000000-0000-0000-0000-0000000000d2',
        (((now() at time zone 'America/Sao_Paulo')::date - 1)::text || ' 09:00')::timestamp
          at time zone 'America/Sao_Paulo',
        'concluida');

do $$
declare
  v_janela date;
begin
  select r.elegivel_apos into v_janela
    from public.retornos r
   where r.paciente_id = '00000000-0000-0000-0000-0000000000e3';

  -- Checagem explícita de NULL: comparar NULL com data devolveria NULL (falso),
  -- e o teste passaria silenciosamente se o retorno nem tivesse sido criado.
  if v_janela is null then
    raise exception 'SMOKE FALHOU (1A): concluir não criou o retorno para a janela de 180 dias';
  end if;

  if v_janela <> ((now() at time zone 'America/Sao_Paulo')::date - 1 + 180) then
    raise exception 'SMOKE FALHOU (1A): janela de 180 dias calculada como % (esperado ontem + 180 = %)',
      v_janela, ((now() at time zone 'America/Sao_Paulo')::date - 1 + 180);
  end if;

  -- E este retorno distante NÃO pode aparecer na semana: prova o recorte da 6A
  if exists (
    select 1 from public.vw_reativacoes_semana v where v.paciente_id = '00000000-0000-0000-0000-0000000000e3'
  ) then
    raise exception 'SMOKE FALHOU (6A): retorno vencível só em +180 dias apareceu na semana';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 3) Idempotência: concluir de novo reusa o MESMO retorno (não duplica)
-- --------------------------------------------------------------------------
update public.consultas set status = 'agendada'
 where id = '00000000-0000-0000-0000-0000000000f1';
update public.consultas set status = 'concluida'
 where id = '00000000-0000-0000-0000-0000000000f1';

do $$
begin
  if (select count(*) from public.retornos
       where paciente_id = '00000000-0000-0000-0000-0000000000e1') <> 1 then
    raise exception 'SMOKE FALHOU (1A): concluir duas vezes duplicou o retorno do paciente';
  end if;
  if (select count(*) from public.retornos
       where paciente_id = '00000000-0000-0000-0000-0000000000e1'
         and status = 'pendente') <> 1 then
    raise exception 'SMOKE FALHOU (1A): esperado exatamente 1 retorno pendente após reabrir+concluir';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 3c) Estado final da consulta de Ana para as seções seguintes: CANCELADA.
--     (Depois de conferir a idempotência, para não anular o retorno antes da
--     hora.) Cancelar É a reversão 1A: o pendente dela sai — e é esta consulta
--     que a seção 5 usa para provar que a lista de hoje esconde canceladas (6A).
-- --------------------------------------------------------------------------
update public.consultas set status = 'cancelada'
 where id = '00000000-0000-0000-0000-0000000000f1';

do $$
begin
  if exists (
    select 1 from public.retornos
     where paciente_id = '00000000-0000-0000-0000-0000000000e1'
       and status = 'pendente'
  ) then
    raise exception 'SMOKE FALHOU (1A): cancelar no fim deveria ter anulado o retorno de Ana';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 4) DENTISTA conclui: permitido pela policy E o trigger escreve mesmo assim
--    (o teste só roda se o usuário de teste existir — senão, avisa e segue)
-- --------------------------------------------------------------------------
do $$
declare
  v_uid uuid;
  v_retornos integer;
begin
  select id into v_uid from auth.users where email = 'smoke-dentista@dentalapp.local';

  if v_uid is null then
    raise notice 'SMOKE INFO (2A): crie o usuário smoke-dentista@dentalapp.local para testar o papel dentista — teste IGNORADO.';
    return;
  end if;

  update public.perfis set role = 'dentista', ativo = true where user_id = v_uid;

  -- Simula o JWT do dentista para as policies desta transação
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  update public.consultas set status = 'concluida'
   where id = '00000000-0000-0000-0000-0000000000f2';

  -- Volta ao contexto privilegiado para conferir o efeito do trigger
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_retornos
    from public.retornos where paciente_id = '00000000-0000-0000-0000-0000000000e2';

  if v_retornos <> 1 then
    raise exception 'SMOKE FALHOU (2A/1A): dentista concluiu, mas o retorno não foi criado para ele (encontrados %)', v_retornos;
  end if;

  if not exists (
    select 1 from public.consultas
     where id = '00000000-0000-0000-0000-0000000000f2' and status = 'concluida'
  ) then
    raise exception 'SMOKE FALHOU (2A): o update de status pelo dentista não foi aplicado';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 5) O retorno do dentista aparece na reativação (RPC 8A) e a consulta
--    cancelada some da agenda de hoje (6A)
-- --------------------------------------------------------------------------
do $$
declare
  v_painel jsonb;
  v_tem_dentista boolean;
begin
  v_painel := public.carregar_painel();

  -- A seção 4 só roda se o usuário de teste do dentista existir; sem ele, a
  -- consulta do Bruno continua 'confirmada' e não há retorno a esperar.
  v_tem_dentista := exists (select 1 from auth.users where email = 'smoke-dentista@dentalapp.local');

  if v_tem_dentista and not exists (
    select 1
      from jsonb_array_elements(v_painel -> 'reativacoes_semana') as r
     where r ->> 'paciente_nome' = 'Bruno Teste T6'
  ) then
    raise exception 'SMOKE FALHOU (1A/8A): retorno do paciente do dentista não apareceu em reativacoes_semana';
  end if;

  if not v_tem_dentista then
    raise notice 'SMOKE INFO (2A): usuário smoke-dentista@dentalapp.local ausente — asserção do Bruno IGNORADA.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_painel -> 'agenda_hoje') as a
     where a ->> 'consulta_id' = '00000000-0000-0000-0000-0000000000f1'
  ) then
    raise exception 'SMOKE FALHOU (6A): consulta cancelada continua na agenda de hoje';
  end if;

  raise notice 'SMOKE OK (T6): agenda_hoje=%, confirmacoes_amanha=%, reativacoes_semana=%',
    jsonb_array_length(v_painel -> 'agenda_hoje'),
    jsonb_array_length(v_painel -> 'confirmacoes_amanha'),
    jsonb_array_length(v_painel -> 'reativacoes_semana');
end $$;

select jsonb_pretty(public.carregar_painel()) as painel_apos_acoes_t6;

rollback;

-- Se nenhum "SMOKE FALHOU" apareceu, a T6 está verificada:
-- concluir alimenta o recall (inclusive pelo dentista), cancelar/reabrir anula,
-- concluir de novo não duplica e a agenda reflete o status.