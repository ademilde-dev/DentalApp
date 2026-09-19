-- ============================================================================
-- DentalApp — Criação de usuários + perfis (T4 — decisão 2A)
-- ----------------------------------------------------------------------------
-- COMO USAR:
--   Passo 1 (Dashboard): Authentication → Users → Add user
--     • informe e-mail + senha; marque "Auto Confirm User" para login imediato.
--     • Sugestão de segurança: após criar os usuários da equipe, desative o
--       signup aberto (Authentication → Providers → Email → "Allow new users
--       to sign up" OFF) para que ninguém se cadastre sozinho.
--   Passo 2 (aqui, SQL Editor): localize o id e insira o perfil.
--
-- Roles (2A): 'recepcionista' = tudo | 'dentista' = leitura + concluir
-- Sem linha em perfis → RLS nega todo acesso (fail-closed).
-- ============================================================================

-- 1) Usuários existentes (confira o e-mail e o id):
select id, email, created_at, last_sign_in_at
  from auth.users
 order by created_at desc
 limit 5;

-- 2) Inserir o PERFIL da recepcionista (troque o e-mail):
insert into public.perfis (user_id, role)
select id, 'recepcionista'::text
  from auth.users
 where email = 'SEU_EMAIL@exemplo.com'
on conflict (user_id) do nothing;

-- 3) (Opcional) Perfil do dentista:
-- insert into public.perfis (user_id, role)
-- select id, 'dentista'::text
--   from auth.users
--  where email = 'DENTISTA@exemplo.com'
-- on conflict (user_id) do nothing;

-- 4) Verificação final — todo usuário deve ter uma role:
select u.email, p.role
  from auth.users u
  left join public.perfis p on p.user_id = u.id
 order by u.created_at desc;

-- 5) Amarrar dentista à tabela dentistas (para a agenda exibir o nome):
-- insert into public.dentistas (nome, user_id)
-- select split_part(email, '@', 1), id
--   from auth.users u
--  where email = 'DENTISTA@exemplo.com'
-- on conflict do nothing;
