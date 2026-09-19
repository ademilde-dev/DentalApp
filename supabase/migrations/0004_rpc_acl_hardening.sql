-- ============================================================================
-- DentalApp — Hardening do ACL da RPC do Painel do Dia (T2 — verify do 8A)
-- Design: docs/designs/fabio-main-design-20260918-2150.md
-- ----------------------------------------------------------------------------
-- POR QUE ESTE ARQUIVO EXISTE
-- O smoke da parte anônima (scripts/smoke-banco-anon.mjs) mostrou, no projeto
-- real, que `anon` ainda EXECUTAVA public.carregar_painel():
--
--   x carregar_painel EXECUTOU com anon -> {"agenda_hoje":[], ...}
--
-- Ou seja, o revoke da 0002 não estava valendo no banco. Não há vazamento de
-- dado (as views são security_invoker e a RLS devolve 0 linhas para anon), mas
-- o "fail-closed" desenhado na decisão 8A não estava de pé: qualquer visitante
-- conseguia chamar a RPC.
--
-- Este arquivo (a) reafirma o ACL para TODAS as assinaturas do nome — cobre o
-- caso de existir uma sobrecarga criada à mão no SQL Editor, que um revoke de
-- assinatura fixa não alcançaria — e (b) imprime o diagnóstico da causa.
--
-- COMO USAR: SQL Editor do Supabase, depois de 0001/0002. É idempotente e pode
-- rodar de novo sem efeito colateral. Leia os resultados do fim do arquivo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Reafirma o ACL em todas as assinaturas de public.carregar_painel()
-- ----------------------------------------------------------------------------
do $$
declare
  assinatura text;
  ajustadas int := 0;
begin
  for assinatura in
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'carregar_painel'
  loop
    execute format('revoke all on function %s from public', assinatura);
    execute format('revoke all on function %s from anon', assinatura);
    execute format('grant execute on function %s to authenticated', assinatura);
    execute format('grant execute on function %s to service_role', assinatura);
    execute format('grant execute on function %s to postgres', assinatura);
    ajustadas := ajustadas + 1;
    raise notice 'ACL do painel reafirmado em %', assinatura;
  end loop;

  if ajustadas = 0 then
    raise warning 'public.carregar_painel() NAO EXISTE — rode a 0002_views_rpc.sql antes deste arquivo.';
  end if;
end $$;

-- A assinatura usada pela aplicação (supabase.rpc('carregar_painel')), repetida
-- fora do DO para ficar explícita no arquivo:
revoke execute on function public.carregar_painel() from public;
revoke execute on function public.carregar_painel() from anon;
grant execute on function public.carregar_painel() to authenticated;
grant execute on function public.carregar_painel() to service_role;

-- ----------------------------------------------------------------------------
-- 2) Leitura das views pelo usuário logado (T4/T5 dependem disto)
--    As views são security_invoker: a RLS continua valendo linha a linha; o
--    grant só garante que a RPC do painel não falhe por permissão com o login
--    real (o painel trata 42501 como "sem sessão").
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select on public.vw_confirmacoes_amanha to authenticated;
grant select on public.vw_reativacoes_semana to authenticated;
grant select on public.vw_agenda_hoje to authenticated;

-- Decisão consciente: NÃO revogamos o select das views do anon. A RLS já
-- devolve 0 linhas (verificado no smoke anônimo) e revogar quebraria a
-- verificação "objeto exposto" que confirma que a migração foi aplicada.
-- O que importa para fail-closed é o EXECUTE da RPC, tratado no passo 1.

-- ----------------------------------------------------------------------------
-- 3) DIAGNÓSTICO — confira as 3 consultas abaixo
-- ----------------------------------------------------------------------------

-- 3a) Assinaturas existentes + quem tem privilégio explícito.
--     Se aparecer "anon=X" aqui, o passo 1 acabou de tirar esse privilégio.
--     Se aparecer assinatura diferente de "carregar_painel()" (ex.: com
--     parâmetros), era ela que o revoke da 0002 não alcançava.
select p.oid::regprocedure as funcao,
       case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as modo,
       coalesce(array_to_string(p.proacl, ' | '), '(sem ACL propria: herda de PUBLIC/owner)') as acl_explicito
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('carregar_painel', 'fn_role_usuario', 'fn_gerenciar_retorno')
 order by p.proname;

-- 3b) Herança de papel: se `anon` for membro de um papel com EXECUTE, revogar
--     direto não basta (o privilégio viria por herança).
select r.rolname as papel,
       pg_has_role('anon', r.oid, 'member') as anon_e_membro
  from pg_roles r
 where r.rolname in ('authenticated', 'service_role', 'postgres', 'pg_read_all_data')
 order by r.rolname;

-- 3c) Verificação final — é exatamente o que scripts/smoke-banco-anon.mjs checa.
--     Esperado: anon_pode_executar = false | authenticated_pode_executar = true
select has_function_privilege('anon', 'public.carregar_painel()', 'execute')          as anon_pode_executar,
       has_function_privilege('authenticated', 'public.carregar_painel()', 'execute') as authenticated_pode_executar;

-- Alerta automático se o fail-closed continuar aberto:
do $$
begin
  if has_function_privilege('anon', 'public.carregar_painel()', 'execute') then
    raise warning 'ATENCAO: anon ainda executa carregar_painel(). Veja o ACL e a heranca de papeis nos resultados 3a/3b.';
  else
    raise notice 'OK: anon nao executa carregar_painel() e authenticated executa (fail-closed de pe).';
  end if;
end $$;

-- ============================================================================
-- FIM 0004_rpc_acl_hardening.sql
-- ============================================================================
