// ============================================================================
// DentalApp — Smoke do banco, PARTE ANON (roda sem privilégios)
// Design: docs/designs/fabio-main-design-20260918-2150.md (verify T1/T2)
// ----------------------------------------------------------------------------
// Verifica com a chave pública (anon):
//   1. Conectividade REST (projeto online, chave válida)
//   2. Objetos da migração 0001/0002 existem e estão expostos no PostgREST
//   3. Fail-closed (dado de saúde): anon NÃO lê linhas (RLS) e NÃO executa
//      carregar_painel() (execute revogado de public/anon na 0002)
//
// A PARTE COM DADOS do smoke (trigger 1A, unique parcial, views povoadas,
// RPC com as 3 listas) roda no SQL Editor do Supabase — arquivo
// supabase/dev/smoke-0001-0002.sql — ou via service_role key.
//
// Uso: node --env-file=.env.local scripts/smoke-banco-anon.mjs
// ============================================================================

const BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!BASE || !KEY) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes no .env.local');
  process.exit(1);
}

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };
let falhas = 0;

const ok = (nome, detalhe) => console.log(`  ✓ ${nome}${detalhe ? ' — ' + detalhe : ''}`);
const falha = (nome, detalhe) => { falhas++; console.log(`  ✗ ${nome}${detalhe ? ' — ' + detalhe : ''}`); };

async function get(path, tentativas = 3) {
  let ultimoErro;
  // A rede desta máquina derruba conexões do node.exe intermitentemente:
  // tentar 3x com backoff resolve a maior parte dos timeouts.
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      return { status: res.status, body };
    } catch (e) {
      ultimoErro = e;
      if (tentativa < tentativas) await new Promise(r => setTimeout(r, 1500 * tentativa));
    }
  }
  throw ultimoErro;
}

console.log('=== SMOKE DO BANCO (parte anon) —', BASE, '===');

// 1) Conectividade (informativo: alguns gateways bloqueiam a spec aberta da
//    raiz com 401 mesmo com chave válida — o que vale são os objetos abaixo)
{
  const { status } = await get('/rest/v1/');
  if (status === 200) ok('REST raiz acessível (HTTP 200)');
  else console.log(`  • REST raiz HTTP ${status} (informativo) — projeto alcançado; objetos verificados abaixo`);
}

// 2) Objetos da migração existem/expostos (404 = ausente; 200 = exposto)
const objetos = [
  'pacientes', 'procedimentos', 'dentistas', 'consultas', 'retornos', 'perfis',
  'vw_agenda_hoje', 'vw_confirmacoes_amanha', 'vw_reativacoes_semana'
];
for (const recurso of objetos) {
  const { status, body } = await get(`/rest/v1/${recurso}?select=*&limit=1`);
  if (status === 200) ok(`objeto exposto: ${recurso}`);
  else if (status === 404) falha(`objeto AUSENTE: ${recurso}`, 'confira a migração 0001/0002');
  else falha(`objeto com erro: ${recurso}`, `HTTP ${status} ${JSON.stringify(body).slice(0, 140)}`);
}

// 3) Fail-closed (RLS): anon não lê nenhuma linha de dado de saúde
for (const recurso of ['pacientes', 'consultas', 'retornos']) {
  const { status, body } = await get(`/rest/v1/${recurso}?select=*`);
  const n = Array.isArray(body) ? body.length : null;
  if (status === 200 && n === 0) ok(`RLS bloqueia leitura anônima de ${recurso} (0 linhas)`);
  else falha(`RLS de ${recurso}`, `HTTP ${status}, linhas=${n}`);
}

// 4) Fail-closed (RPC): anon não executa carregar_painel()
{
  const { status, body } = await get('/rest/v1/rpc/carregar_painel');
  if (status === 200) {
    falha('carregar_painel EXECUTOU com anon — execute deveria estar revogado!', JSON.stringify(body).slice(0, 200));
  } else {
    ok('carregar_painel negada para anon (fail-closed correto)', `HTTP ${status}`);
  }
}

console.log(falhas === 0
  ? '=== PARTE ANON DO SMOKE: TUDO OK ==='
  : `=== PARTE ANON DO SMOKE: ${falhas} FALHA(S) ===`);
process.exit(falhas === 0 ? 0 : 1);
