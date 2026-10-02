-- ============================================================================
-- DentalApp — Agendamento e Gestão de Consultas (modal 'Agendar Consulta')
-- ----------------------------------------------------------------------------
-- A tabela public.consultas já existe (0001) com FKs para pacientes,
-- procedimentos e dentistas. Este arquivo prepara o cadastro:
--   1. public.procedimentos ganha `preco` (numeric) — o preço que a UI sempre
--      mostrou no agendamento agora mora no banco (fonte de verdade, T1).
--   2. Seed IDEMPOTENTE de public.procedimentos e public.dentistas quando as
--      tabelas estão vazias — sem isso o modal não tem opções reais de
--      profissional/procedimento e o INSERT em consultas quebraria na FK.
--   3. Índice para o filtro por dentista da aba Agenda & Consultas.
--
-- Como rodar: Supabase Dashboard → SQL Editor (depois de 0001..0004).
-- Reexecutável (idempotente): só insere quando a tabela está vazia.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) preco em public.procedimentos (valor padrão do agendamento)
-- ----------------------------------------------------------------------------
alter table public.procedimentos
  add column if not exists preco numeric(10,2) not null default 0;

comment on column public.procedimentos.preco is
  'Valor padrão em reais exibido no agendamento (migrado dos mocks locais da fase anterior).';

-- ----------------------------------------------------------------------------
-- 2) Seed idempotente do catálogo de procedimentos (5 itens do consultório)
-- ----------------------------------------------------------------------------
insert into public.procedimentos (nome, janela_retorno_dias, preco)
select v.nome, v.janela, v.preco
  from (values
    ('Avaliação Inicial',    180, 120.00),
    ('Limpeza Profilaxia',   180, 200.00),
    ('Canal Endodontia',     180, 750.00),
    ('Extração Simples',     180, 300.00),
    ('Ortodontia Manutenção', 180, 150.00)
  ) as v(nome, janela, preco)
 where not exists (select 1 from public.procedimentos)
   and not exists (select 1 from public.procedimentos where nome = v.nome);

-- ----------------------------------------------------------------------------
-- 3) Seed idempotente da equipe de dentistas
-- ----------------------------------------------------------------------------
insert into public.dentistas (nome, ativo)
select v.nome, true
  from (values
    ('Dra. Fabíola Monteiro'),
    ('Dr. Carlos Silva'),
    ('Dr. Mateus Santos')
  ) as v(nome)
 where not exists (select 1 from public.dentistas)
   and not exists (select 1 from public.dentistas where nome = v.nome);

-- ----------------------------------------------------------------------------
-- 4) Índice por dentista (filtro da aba Agenda & Consultas)
-- ----------------------------------------------------------------------------
create index if not exists consultas_dentista_idx
  on public.consultas (dentista_id);

-- ============================================================================
-- FIM 0005_agendamento_consultas.sql
-- ============================================================================