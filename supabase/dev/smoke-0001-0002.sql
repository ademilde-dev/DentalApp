-- ============================================================================
-- DentalApp — Smoke test manual (verify da T2 do design)
-- Design: docs/designs/fabio-main-design-20260918-2150.md
-- ----------------------------------------------------------------------------
-- COMO USAR: SQL Editor do Supabase, APÓS rodar 0001_init.sql e 0002_views_rpc.sql.
-- 100% transacional: ROLLBACK no fim — nenhum dado persiste.
--
-- Cobre o verify do design:
--   T1: concluir → retorno criado; reverter → anulado; 2ª conclusão → reestendido
--   T2: consulta de 08:00 de amanhã na lista certa (fuso UTC-3); 3 listas em 1 chamada
--   1A: unique parcial bloqueia um 2º retorno pendente para o mesmo paciente
--   6A: cancelada some da lista
--
-- Qualquer "SMOKE FALHOU" aborta o script (e o rollback desfaz tudo).
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- Dados do cenário (datas relativas a "hoje" no fuso America/Sao_Paulo)
-- --------------------------------------------------------------------------
insert into public.procedimentos (id, nome, janela_retorno_dias)
values ('00000000-0000-0000-0000-0000000000a1', 'Limpeza Profilaxia (smoke)', 180);

insert into public.pacientes (id, nome, telefone, alertas_saude)
values ('00000000-0000-0000-0000-0000000000b1', 'Maria Teste da Silva',
        '(11) 99876-5432',
        '{"alergias":"Penicilina","hipertensao":true,"diabetes":false}'::jsonb);

insert into public.pacientes (id, nome, telefone)  -- sem telefone (6A)
values ('00000000-0000-0000-0000-0000000000b2', 'Carlos Teste', null);

-- C1: consulta de HOJE às 14:00 (SP) — deve aparecer em vw_agenda_hoje
insert into public.consultas (id, paciente_id, procedimento_id, data, status)
values ('00000000-0000-0000-0000-0000000000c1',
        '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a1',
        (((now() at time zone 'America/Sao_Paulo')::date)::text || ' 14:00')::timestamp
          at time zone 'America/Sao_Paulo',
        'agendada');

-- C2: consulta de AMANHÃ às 08:00 (SP) — deve aparecer em vw_confirmacoes_amanha
insert into public.consultas (id, paciente_id, procedimento_id, data, status)
values ('00000000-0000-0000-0000-0000000000c2',
        '00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-0000000000a1',
        (((now() at time zone 'America/Sao_Paulo')::date + 1)::text || ' 08:00')::timestamp
          at time zone 'America/Sao_Paulo',
        'agendada');

-- C3: consulta CONCLUÍDA há 192 dias — dispara o trigger 1A
--     elegivel_apos = (hoje - 192) + 180 = hoje - 12 (vencida → reativação)
insert into public.consultas (id, paciente_id, procedimento_id, data, status)
values ('00000000-0000-0000-0000-0000000000c3',
        '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a1',
        (((now() at time zone 'America/Sao_Paulo')::date - 192)::text || ' 10:00')::timestamp
          at time zone 'America/Sao_Paulo',
        'concluida');

-- --------------------------------------------------------------------------
-- 1) 1A — conclusão cria retorno pendente com elegivel_apos correto
-- --------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from public.retornos
     where paciente_id        = '00000000-0000-0000-0000-0000000000b1'
       and status             = 'pendente'
       and consulta_origem_id = '00000000-0000-0000-0000-0000000000c3'
       and elegivel_apos      = (now() at time zone 'America/Sao_Paulo')::date - 12
  ) then
    raise exception 'SMOKE FALHOU (1A): conclusão não criou retorno pendente com elegivel_apos correto';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 2) 1A — 2ª conclusão (C4, há 100 dias) REESTENDE o mesmo pendente
-- --------------------------------------------------------------------------
insert into public.consultas (id, paciente_id, procedimento_id, data, status)
values ('00000000-0000-0000-0000-0000000000c4',
        '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a1',
        (((now() at time zone 'America/Sao_Paulo')::date - 100)::text || ' 09:00')::timestamp
          at time zone 'America/Sao_Paulo',
        'concluida');

do $$
begin
  if not exists (
    select 1 from public.retornos
     where paciente_id        = '00000000-0000-0000-0000-0000000000b1'
       and status             = 'pendente'
       and consulta_origem_id = '00000000-0000-0000-0000-0000000000c4'
       and elegivel_apos      = (now() at time zone 'America/Sao_Paulo')::date + 80
  ) then
    raise exception 'SMOKE FALHOU (1A): 2ª conclusão não reestendeu elegivel_apos';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 3) 1A — reversão de C4 anula o retorno pendente
-- --------------------------------------------------------------------------
update public.consultas set status = 'faltou'
 where id = '00000000-0000-0000-0000-0000000000c4';

do $$
begin
  if exists (
    select 1 from public.retornos
     where paciente_id = '00000000-0000-0000-0000-0000000000b1'
       and status = 'pendente'
  ) then
    raise exception 'SMOKE FALHOU (1A): reversão não anulou o retorno pendente';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 4) 1A — unique parcial: 2º retorno pendente para o mesmo paciente é bloqueado
--    (re-concluindo C3 primeiro, para existir um pendente)
-- --------------------------------------------------------------------------
update public.consultas set status = 'agendada'
 where id = '00000000-0000-0000-0000-0000000000c3';
update public.consultas set status = 'concluida'
 where id = '00000000-0000-0000-0000-0000000000c3';

do $$
begin
  begin
    insert into public.retornos (paciente_id, consulta_origem_id, elegivel_apos, status)
    values ('00000000-0000-0000-0000-0000000000b1',
            '00000000-0000-0000-0000-0000000000c3',
            (now() at time zone 'America/Sao_Paulo')::date - 12,
            'pendente');
    raise exception 'SMOKE FALHOU (1A): unique parcial não bloqueou 2º retorno pendente';
  exception when unique_violation then
    null; -- comportamento esperado (1A: no máximo 1 pendente por paciente)
  end;
end $$;

-- --------------------------------------------------------------------------
-- 5) Views 4A — hoje/amanhã no fuso SP + 6A (cancelada some)
-- --------------------------------------------------------------------------
insert into public.consultas (id, paciente_id, procedimento_id, data, status)
values ('00000000-0000-0000-0000-0000000000c6',
        '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000a1',
        (((now() at time zone 'America/Sao_Paulo')::date + 1)::text || ' 09:00')::timestamp
          at time zone 'America/Sao_Paulo',
        'agendada');

do $$
begin
  if (select count(*) from public.vw_confirmacoes_amanha) <> 2 then
    raise exception 'SMOKE FALHOU (4A): esperadas 2 consultas em vw_confirmacoes_amanha';
  end if;
  if not exists (
    select 1 from public.vw_agenda_hoje
     where consulta_id = '00000000-0000-0000-0000-0000000000c1'
  ) then
    raise exception 'SMOKE FALHOU (4A): consulta de hoje ausente em vw_agenda_hoje';
  end if;
  if exists (
    select 1 from public.vw_confirmacoes_amanha
     where tem_telefone = false
       and paciente_id <> '00000000-0000-0000-0000-0000000000b2'
  ) then
    raise exception 'SMOKE FALHOU (6A): tem_telefone inconsistente';
  end if;
  if exists (
    select 1 from public.vw_confirmacoes_amanha
     where consulta_id = '00000000-0000-0000-0000-0000000000c2'
       and tem_telefone = true
  ) then
    raise exception 'SMOKE FALHOU (6A): C2 sem telefone deveria ter tem_telefone = false';
  end if;
end $$;

-- 6A: cancelada some da lista de confirmação
update public.consultas set status = 'cancelada'
 where id = '00000000-0000-0000-0000-0000000000c6';

do $$
begin
  if (select count(*) from public.vw_confirmacoes_amanha) <> 1 then
    raise exception 'SMOKE FALHOU (6A): cancelada deveria sair de vw_confirmacoes_amanha';
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 6) 8A — RPC única: 3 listas em 1 chamada
--    Esperado: confirmacoes_amanha=[C2 sem telefone] | reativacoes_semana=[C3
--    vencida] | agenda_hoje=[C1]
-- --------------------------------------------------------------------------
select jsonb_pretty(public.carregar_painel()) as painel_do_dia;

rollback;

-- Se o select acima mostrou as 3 listas e nenhum "SMOKE FALHOU" apareceu,
-- a migração 0001 + 0002 está verificada (verify T1/T2 do design OK).

