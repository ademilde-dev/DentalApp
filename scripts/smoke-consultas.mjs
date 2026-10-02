// Smoke estatico da camada de agendamento (Sem CLI / sem escrita no banco).
// Uso: node scripts/smoke-consultas.mjs   (exit 0 = tudo ok)
import { readFileSync } from 'node:fs';

const src = readFileSync('lib/consultas.ts', 'utf8');
const ui = readFileSync('app/painel/page.tsx', 'utf8');
const comp = readFileSync('components/painel-do-dia.tsx', 'utf8');
const dent = readFileSync('lib/dentistas.ts', 'utf8');
const proc = readFileSync('lib/procedimentos.ts', 'utf8');
const mig5 = readFileSync('supabase/migrations/0005_agendamento_consultas.sql', 'utf8');

let falhas = 0;
const check = (ok, nome) => {
  console.log(`${ok ? '  OK' : 'FALHA'} ${nome}`);
  if (!ok) falhas += 1;
};

console.log('=== SMOKE CONSULTAS (agendamento + libs) ===');
console.log('[A] lib/consultas.ts');
for (const nome of [
  'export async function carregarConsultas',
  'export async function criarConsulta',
  'export async function atualizarConsulta',
  'export type StatusConsultaUI',
  'STATUS_UI_PARA_BANCO',
  'STATUS_BANCO_PARA_UI',
  'export interface ConsultaAgenda',
  'linhaParaConsultaAgenda',
  'projetarSP',       // função de fuso SP
  'momentoSP',         // construtor de timestamptz
  'erroSemPermissaoConsulta',
  'mensagemErroConsulta',
  '23503',             // mensagem FK
]) check(src.includes(nome), nome);

console.log('[B] lib/dentistas.ts');
for (const nome of ['carregarDentistas', 'export interface Dentista']) check(dent.includes(nome), nome);

console.log('[C] lib/procedimentos.ts');
for (const nome of [
  'carregarProcedimentos', 'criarProcedimento', 'atualizarProcedimento', 'excluirProcedimento',
  'contarConsultasDoProcedimento', 'linhaParaProcedimento',
]) check(proc.includes(nome), nome);

console.log('[D] app/painel/page.tsx (wiring)');
for (const nome of [
  "from '../../lib/consultas'",
  "from '../../lib/dentistas'",
  "from '../../lib/procedimentos'",
  'carregarConsultas',
  'criarConsulta',
  'atualizarConsulta',
  'excluirProcedimento',
  'criarProcedimento',
  'atualizarProcedimento',
  'marcarStatusConsulta',
  'versaoPainel',
  'setVersaoPainel',
  'recarregarEm={versaoPainel}',
  'dentistasDisponiveis',
  'setDentistasDisponiveis',
  'appPatientSearch',
  'salvandoConsulta',
  'somenteLeituraAgenda',
  'recarregarConsultas',
  'missed',             // status Faltou
]) check(ui.includes(nome), nome);

console.log('[E] components/painel-do-dia.tsx');
for (const nome of ['recarregarEm', 'recargaAnterior']) check(comp.includes(nome), nome);

console.log('[F] migration 0005_agendamento_consultas.sql');
for (const nome of ['preco numeric', 'Seed idempotente', 'consultas_dentista_idx', 'Dra. Fabíola Monteiro', 'Avaliação Inicial', 'Canal Endodontia']) check(mig5.includes(nome), nome);

console.log(falhas === 0 ? '=== SMOKE CONSULTAS: TUDO OK ===' : `=== ${falhas} FALHA(S) ===`);
process.exit(falhas === 0 ? 0 : 1);