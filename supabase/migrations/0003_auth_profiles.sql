-- ============================================================================
-- DentalApp — Autenticação: perfis automáticos + controlo de acesso (0003)
-- Design: docs/designs/fabio-main-design-20260918-2150.md (decisão 2A)
-- ----------------------------------------------------------------------------
-- Escopo:
--   1. public.perfis ganha nome_completo, ativo e atualizado_em
--   2. Trigger on_auth_user_created (auth.users) → cria o perfil automaticamente
--   3. fn_role_usuario() passa a exigir ativo = true (fail-closed: usuário
--      bloqueado perde todo o acesso por RLS, mesmo com JWT válido)
--   4. Backfill opcional (comentado) para os usuários já existentes
--
-- Como rodar: Supabase Dashboard → SQL Editor (colar e executar) ou
--   `supabase db push` (CLI). Reexecutável (idempotente) para re-runs manuais.
--
-- Segurança (leia antes de abrir o cadastro público):
--   O cadastro por e-mail/senha é controlado em
--   Authentication → Providers → Email → "Allow new users to sign up".
--   Com o cadastro ABERTO, qualquer pessoa que se registe ganha uma linha em
--   perfis com role válida e ativo = true, isto é, acesso a dados de saúde.
--   Recomendação: cadastro DESLIGADO em produção e equipe criada pelo
--   administrador (Dashboard → Add user, com "Auto Confirm User").
--   Para exigir aprovação manual de cada novo registro, use o bloco 5.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CAMPOS NOVOS EM perfis
-- ----------------------------------------------------------------------------
alter table public.perfis add column if not exists nome_completo text;
alter table public.perfis add column if not exists ativo    boolean not null default true;
alter table public.perfis add column if not exists atualizado_em timestamptz not null default now();

comment on column public.perfis.nome_completo is
  'Nome exibido na UI — vem de raw_user_meta_data (nome_completo/full_name) ou do prefixo do e-mail';
comment on column public.perfis.ativo is
  'true = acesso liberado | false = bloqueado (fn_role_usuario devolve null → RLS nega tudo)';
comment on column public.perfis.role is
  'recepcionista = tudo | dentista = leitura + concluir consulta (decisão 2A)';

-- atualizado_em automático (reusa fn_set_atualizado_em criada na 0001)
drop trigger if exists perfis_atualizado_em_trg on public.perfis;
create trigger perfis_atualizado_em_trg
before update on public.perfis
for each row
execute function public.fn_set_atualizado_em();

-- ----------------------------------------------------------------------------
-- 2) PROVISIONAMENTO AUTOMÁTICO — trigger on_auth_user_created
--    SECURITY DEFINER: o insert em perfis acontece com os privilégios do dono
--    da função, sem depender de policy de INSERT — que permanece inexistente
--    de propósito (o cliente nunca escreve em perfis).
-- ----------------------------------------------------------------------------
create or replace function public.fn_criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_role text;
begin
  -- Nome de exibição: metadata do signup → senão o prefixo do e-mail
  v_nome := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'nome_completo',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');
  if v_nome is null then
    v_nome := split_part(coalesce(new.email, 'usuario'), '@', 1);
  end if;

  -- Role: aceita SOMENTE valores conhecidos (qualquer outro → recepcionista)
  v_role := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'role', '')), '');
  if v_role is null or v_role not in ('recepcionista', 'dentista') then
    v_role := 'recepcionista';
  end if;

  insert into public.perfis (user_id, role, nome_completo, ativo)
  values (
    new.id,
    v_role,
    v_nome,
    -- metadata 'ativo' (bool) permite criar usuário já bloqueado; default true
    coalesce((new.raw_user_meta_data ->> 'ativo')::boolean, true)
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.fn_criar_perfil_novo_usuario() is
  'on_auth_user_created (2A): cria a linha em public.perfis para todo novo usuário do Auth';

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'auth') then
    execute 'drop trigger if exists on_auth_user_created on auth.users';
    execute 'create trigger on_auth_user_created
               after insert on auth.users
               for each row
               execute function public.fn_criar_perfil_novo_usuario()';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) fn_role_usuario() — agora exige ativo = true
--    Autenticado mas bloqueado (ativo = false) → null → RLS nega leitura e
--    escrita em TODAS as tabelas, e a RPC carregar_painel() devolve listas
--    vazias. A própria linha em perfis segue legível (policy da 0001), o que
--    permite a tela de login informar "usuário desativado".
-- ----------------------------------------------------------------------------
create or replace function public.fn_role_usuario()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.perfis p
   where p.user_id = (select auth.uid())
     and p.ativo
-- ----------------------------------------------------------------------------
-- 4) (OPCIONAL) Backfill dos usuários que já existiam antes deste trigger.
--    Descomente para criar perfis faltantes. ativo = false de propósito: força
--    uma revisão explícita antes de liberar acesso a quem já estava no Auth.
-- ----------------------------------------------------------------------------
-- insert into public.perfis (user_id, role, nome_completo, ativo)
-- select u.id,
--        'recepcionista',
--        split_part(coalesce(u.email, 'usuario'), '@', 1),
--        false
--   from auth.users u
--  where not exists (select 1 from public.perfis p where p.user_id = u.id)
-- on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 5) (OPCIONAL) Modo "aprovação do administrador".
--    Descomente ANTES de abrir o cadastro público se quiser que todo novo
--    registro nasça bloqueado e precise ser liberado manualmente depois.
-- ----------------------------------------------------------------------------
-- create or replace function public.fn_criar_perfil_novo_usuario()
-- returns trigger language plpgsql security definer set search_path = '' as $$
-- declare v_nome text;
-- begin
--   v_nome := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nome_completo', '')), '');
--   if v_nome is null then
--     v_nome := split_part(coalesce(new.email, 'usuario'), '@', 1);
--   end if;
--   insert into public.perfis (user_id, role, nome_completo, ativo)
--   values (new.id, 'recepcionista', v_nome, false)
--   on conflict (user_id) do nothing;
--   return new;
-- end; $$;

-- ----------------------------------------------------------------------------
-- 6) Operação — comandos de apoio (rodar no SQL Editor quando precisar)
-- ----------------------------------------------------------------------------
-- Bloquear / liberar acesso:
--   update public.perfis set ativo = false
--    where user_id = (select id from auth.users where email = 'EMAIL');
--
-- Trocar papel:
--   update public.perfis set role = 'dentista'
--    where user_id = (select id from auth.users where email = 'EMAIL');
--
-- Nome exibido:
--   update public.perfis set nome_completo = 'Dra. Fabíola Dulce Monteiro'
--    where user_id = (select id from auth.users where email = 'EMAIL');
--
-- Conferência geral (todo usuário do Auth deve ter perfil; nenhum perfil
-- deve apontar para usuário inexistente):
--   select u.email, p.role, p.ativo, p.nome_completo
--     from auth.users u
--     left join public.perfis p on p.user_id = u.id
--    order by u.created_at desc;

-- ============================================================================
-- FIM 0003_auth_profiles.sql
-- ============================================================================
   limit 1;
$$;

comment on function public.fn_role_usuario() is
  'Role do usuário logado (null se não autenticado, sem perfil ou inativo) — base das policies 2A';