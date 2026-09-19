-- ============================================================================
-- DentalApp — RPC do Painel do Dia (T2 do design — decisão 8A)
-- Design: docs/designs/fabio-main-design-20260918-2150.md
-- ----------------------------------------------------------------------------
-- carregar_painel(): as 3 listas do Painel do Dia em 1 round-trip.
--   - Joins no servidor, zero N+1
--   - Fuso America/Sao_Paulo calculado no banco (via views 4A de 0001_init.sql)
--   - SECURITY INVOKER (default): respeita a RLS do chamador (decisão 2A)
--
-- Uso (supabase-js, T5):
--   const { data, error } = await supabase.rpc('carregar_painel');
--   data.confirmacoes_amanha | data.reativacoes_semana | data.agenda_hoje
-- ============================================================================

create or replace function public.carregar_painel()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'gerado_em_sp',
      to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'confirmacoes_amanha',
      (select coalesce(jsonb_agg(to_jsonb(v) order by v.data), '[]'::jsonb)
         from public.vw_confirmacoes_amanha v),
    'reativacoes_semana',
      (select coalesce(jsonb_agg(to_jsonb(v) order by v.elegivel_apos, v.paciente_nome), '[]'::jsonb)
         from public.vw_reativacoes_semana v),
    'agenda_hoje',
      (select coalesce(jsonb_agg(to_jsonb(v) order by v.data), '[]'::jsonb)
         from public.vw_agenda_hoje v)
  );
$$;

comment on function public.carregar_painel() is
  'Painel do Dia (8A): 3 listas em 1 chamada — supabase.rpc("carregar_painel")';

-- Defesa extra (dado de saúde): execução somente para quem precisa.
-- ATENÇÃO: o Supabase aplica default privileges concedendo EXECUTE a
-- anon/authenticated/service_role em funções novas — revoke de "public" não
-- remove esses grants diretos. O revoke do "anon" é obrigatório (fail-closed).
-- `postgres` fica mantido para o verify manual no SQL Editor / smoke test.
revoke execute on function public.carregar_painel() from public;
revoke execute on function public.carregar_painel() from anon;
grant execute on function public.carregar_painel() to authenticated;
grant execute on function public.carregar_painel() to service_role;
grant execute on function public.carregar_painel() to postgres;

-- ============================================================================
-- FIM 0002_views_rpc.sql
-- ============================================================================
