// Smoke estatico da camada de pacientes (Sem CLI / sem escrita no banco).
// Uso: node scripts/smoke-pacientes.mjs   (exit 0 = tudo ok)
import { readFileSync } from 'node:fs';

const src = readFileSync('lib/pacientes.ts', 'utf8');
const ui = readFileSync('app/painel/page.tsx', 'utf8');

let falhas = 0;
const check = (ok, nome) => {
  console.log(`${ok ? '  OK' : 'FALHA'} ${nome}`);
  if (!ok) falhas += 1;
};

console.log('=== SMOKE PACIENTES (lib + aba, sem escrita) ===');
console.log('[A] lib/pacientes.ts');
for (const nome of [
  'linhaParaPaciente',
  'pacienteParaLinha',
  'export async function carregarPacientes',
  'export async function criarPaciente',
  'export async function atualizarPaciente',
  'contarConsultasDoPaciente',
  'export async function excluirPaciente',
  'importarPacientesLocais',
  'ficha:',
  'alertas_saude',
]) check(src.includes(nome), nome);

console.log('[B] app/painel/page.tsx');
for (const nome of [
  "from '../../lib/pacientes'",
  'recarregarPacientes',
  'migrarPacientesLocais',
  'patients-loading-state',
  'somenteLeituraPacientes',
  'Migrar para o Supabase',
]) check(ui.includes(nome), nome);

console.log(falhas === 0 ? '=== SMOKE PACIENTES: TUDO OK ===' : `=== ${falhas} FALHA(S) ===`);
process.exit(falhas === 0 ? 0 : 1);
