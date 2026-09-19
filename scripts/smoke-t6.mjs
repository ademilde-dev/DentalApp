import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
if (!BASE || !KEY) { console.error('X env ausente'); process.exit(1); }
const HEADERS = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
let falhas = 0, testes = 0;
const checar = (c, n, d) => { testes++; if (!c) falhas++; console.log((c ? '  OK ' : '  FALHA ') + n + (d ? ' - ' + d : '')); };
async function req(url, init, tentativas = 3) {
  let ultimo;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const res = await fetch(url, init);
      const texto = await res.text();
      let corpo; try { corpo = JSON.parse(texto); } catch { corpo = texto; }
      return { status: res.status, corpo };
    } catch (e) { ultimo = e; if (i < tentativas) await new Promise((r) => setTimeout(r, 1500 * i)); }
  }
  throw ultimo;
}
console.log('=== SMOKE T6 (acoes da agenda -> recall) - ' + BASE + ' ===');
console.log('[A] RLS via REST (anon)');
const FAKE = '00000000-0000-0000-0000-0000000000ff';
{
  const r = await req(BASE + '/rest/v1/consultas?id=eq.' + FAKE + '&select=id',
    { method: 'PATCH', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify({ status: 'concluida' }) });
  const zl = r.status === 200 && Array.isArray(r.corpo) && r.corpo.length === 0;
  checar(r.status === 401 || r.status === 403 || r.status === 404 || zl, 'anon nao altera consulta (RLS 2A)', 'HTTP ' + r.status);
}
{
  const r = await req(BASE + '/rest/v1/retornos?id=eq.' + FAKE + '&select=id',
    { method: 'PATCH', headers: { ...HEADERS, Prefer: 'return=representation' }, body: JSON.stringify({ status: 'contatado' }) });
  const zl = r.status === 200 && Array.isArray(r.corpo) && r.corpo.length === 0;
  checar(r.status === 401 || r.status === 403 || r.status === 404 || zl, 'anon nao escreve retornos (so trigger 1A)', 'HTTP ' + r.status);
}
{
  const r = await req(BASE + '/rest/v1/rpc/carregar_painel', { headers: HEADERS });
  checar(r.status !== 200, 'carregar_painel negada para anon', 'HTTP ' + r.status);
}
console.log('[B] Implementacao (estatico)');
const consultas = ler('lib/consultas.ts');
const painelComp = ler('components/painel-do-dia.tsx');
const painelLib = ler('lib/painel.ts');
const init = ler('supabase/migrations/0001_init.sql');
const smokeSql = existsSync(join(ROOT, 'supabase/dev/smoke-0003-acoes-t6.sql')) ? ler('supabase/dev/smoke-0003-acoes-t6.sql') : '';
checar(/marcarStatusConsulta/.test(consultas), 'lib/consultas.ts expoe marcarStatusConsulta()');
checar(/length === 0/.test(consultas), 'UI detecta RLS sem erro (zero linhas)');
checar(/EFEITO_NO_RETORNO/.test(consultas), 'titles explicam efeito no recall');
checar(/podeConcluir/.test(painelComp) && /podeCancelar/.test(painelComp), 'regras podeConcluir/podeCancelar');
checar(/Concluir/.test(painelComp) && /Cancelar/.test(painelComp) && /Reabrir/.test(painelComp), 'botoes Concluir+Cancelar+Reabrir');
checar(/alterarStatus/.test(painelComp), 'alterarStatus() otimista com rollback');
checar(/carregarPainel/.test(painelComp), 'painel recarrega apos acao');
checar(/marcarContatado/.test(painelLib), 'marcarContatado mantido (reativacao)');
checar(/fn_gerenciar_retorno/.test(init), 'trigger fn_gerenciar_retorno (1A)');
checar(/SECURITY DEFINER/.test(init), 'trigger SECURITY DEFINER');
checar(/retornos_paciente_pendente_uidx/.test(init), 'unique parcial 1 pendente/paciente');
checar(/consultas_dentista_concluir/.test(init), 'policy dentista_concluir');
checar(/consultas_recepcionista_all/.test(init), 'policy recepcionista_all');
checar(smokeSql.length > 0, 'smoke-0003-acoes-t6.sql existe');
checar(/SMOKE FALHOU/.test(smokeSql) && /rollback/i.test(smokeSql), 'smoke SQL aborta + rollback');
console.log(falhas === 0 ? '=== SMOKE T6: TUDO OK (' + testes + '/' + testes + ') ===' : '=== SMOKE T6: ' + falhas + ' FALHA(S) em ' + testes + ' ===');
process.exit(falhas === 0 ? 0 : 1);
