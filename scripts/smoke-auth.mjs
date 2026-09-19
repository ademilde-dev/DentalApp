/**
 * Smoke test do fluxo de entrada (splash + login + proteção de rotas).
 *
 * Valida o que o proxy.ts precisa garantir em produção, sem precisar de sessão
 * real: usa o cookie de modo demonstração para provar o caminho "autenticado".
 *
 * Uso (com o servidor rodando em http://localhost:3000):
 *   node scripts/smoke-auth.mjs
 *   node scripts/smoke-auth.mjs http://localhost:3100
 *
 * Requer apenas Node 18+ (fetch nativo). Não toca o banco.
 */

const base = (process.argv[2] || process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const COOKIE_DEMO = 'dentalapp_modo_demo=1';

let falhas = 0;
let testes = 0;

const registrar = (ok, titulo, detalhe) => {
  testes += 1;
  if (!ok) falhas += 1;
  console.log(`${ok ? '  OK  ' : ' FALHA'} ${titulo}${detalhe ? ` — ${detalhe}` : ''}`);
};

/** Faz a requisição sem seguir redirect (queremos ver o 3xx e o Location). */
const pedir = async (caminho, opcoes = {}) => {
  try {
    return await fetch(`${base}${caminho}`, { redirect: 'manual', ...opcoes });
  } catch (erro) {
    console.error(`\nNão foi possível alcançar ${base}${caminho}: ${erro.message}`);
    console.error('Suba o servidor antes: npm run dev (ou npm start).');
    process.exit(1);
  }
};

const local = (r) => r.headers.get('location') || '';

console.log(`\n=== Smoke do fluxo de entrada em ${base} ===\n`);

// 1) Splash (rota "/") — pública, é a porta de entrada
const splash = await pedir('/');
registrar(splash.status === 200, 'GET / (splash) responde 200', `status ${splash.status}`);
const htmlSplash = await splash.text();
registrar(
  htmlSplash.includes('splash-screen'),
  'splash renderiza o layout de entrada (.splash-screen)'
);

// 2) Login — público
const login = await pedir('/login');
registrar(login.status === 200, 'GET /login responde 200', `status ${login.status}`);
const htmlLogin = await login.text();
registrar(htmlLogin.includes('auth-abas'), 'login traz as abas Entrar / Criar conta');
registrar(htmlLogin.includes('Explorar em modo demonstração'), 'login oferece o modo demonstração');

// 3) Proteção de rota interna — anônimo deve ser mandado para o login
const painelAnon = await pedir('/painel');
const destinoAnon = local(painelAnon);
registrar(
  [302, 303, 307, 308].includes(painelAnon.status),
  'GET /painel sem sessão redireciona (não entrega conteúdo)',
  `status ${painelAnon.status}`
);
registrar(
  destinoAnon.includes('/login'),
  'redirect do /painel aponta para /login',
  destinoAnon || 'sem Location'
);
registrar(
  destinoAnon.includes('redirect=%2Fpainel') || destinoAnon.includes('redirect=/painel'),
  'redirect preserva o destino original (?redirect=/painel)',
  destinoAnon || 'sem Location'
);

// 4) API interna — 401 em JSON, nunca redirect
const apiAnon = await pedir('/api/gemini/analyze', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: 'teste de acesso' }),
});
registrar(apiAnon.status === 401, 'POST /api/gemini/analyze sem sessão responde 401', `status ${apiAnon.status}`);
const jsonApi = await apiAnon.json().catch(() => ({}));
registrar(Boolean(jsonApi.error), 'CT 401 devolve JSON com campo "error"');

// 5) Modo demonstração — prova o caminho "com acesso" sem usuário real.
//    O /painel é renderizado no cliente, então no SSR o que se pode afirmar é:
//    (a) o proxy liberou a rota (200, sem redirect), (b) o primeiro paint já traz
//    a marca com o spinner (mesma tela do splash) e (c) o formulário de login NÃO
//    foi entregue. A renderização das listas é validada no navegador.
const painelDemo = await pedir('/painel', { headers: { cookie: COOKIE_DEMO } });
registrar(
  painelDemo.status === 200,
  'GET /painel com cookie de demonstração responde 200 (proxy liberou)',
  `status ${painelDemo.status}`
);
const htmlPainel = await painelDemo.text();
registrar(htmlPainel.includes('splash-screen'), 'primeiro paint do /painel usa a marca (loader do splash)');
registrar(
  !htmlPainel.includes('auth-abas'),
  '/painel não entrega o formulário de login (acesso concedido)'
);

// 6) Logado não deve ver a tela de login
const loginDemo = await pedir('/login', { headers: { cookie: COOKIE_DEMO } });
registrar(
  [302, 303, 307, 308].includes(loginDemo.status),
  'GET /login em sessão de demonstração redireciona',
  `status ${loginDemo.status}`
);
registrar(local(loginDemo).includes('/painel'), 'redirect do /login vai para /painel', local(loginDemo) || 'sem Location');

// 7) Assets não passam pelo proxy
const logo = await pedir('/logo_cartao.jpg');
registrar(logo.status === 200, 'GET /logo_cartao.jpg responde 200 (asset livre)', `status ${logo.status}`);

console.log(`\n=== ${testes - falhas}/${testes} verificações OK ===`);
if (falhas > 0) {
  console.log(`${falhas} FALHA(S) — revise o proxy.ts e as rotas antes do deploy.\n`);
  process.exit(1);
}
console.log('Fluxo de entrada validado: splash, login, proteção de rotas e 401 na API.\n');