import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { COOKIE_MODO_DEMO } from './lib/modo-demo-cookie';

/**
 * proxy.ts — proteção de rotas e renovação de sessão (Next.js 16).
 *
 * No Next 16 o antigo `middleware.ts` foi renomeado para `proxy.ts`
 * (o tipo `NextProxy` confirma). Este arquivo roda ANTES de cada requisição
 * que não seja asset estático, e tem três responsabilidades:
 *
 *   1. Renovar o token do Supabase e reescrever o cookie atualizado
 *      (sem isto a sessão morre silenciosamente após o expiry);
 *   2. Bloquear rotas internas sem sessão válida — redirect para /login
 *      com `?redirect=` para devolver o usuário ao destino original;
 *   3. Responder 401 em JSON para /api/* (em vez de redirecionar a API).
 *
 * Decisão de segurança: usamos `getUser()` (valida o JWT contra o servidor do
 * Supabase) e nunca `getSession()` sozinho — o cookie é manipulável pelo
 * cliente e não pode ser fonte de verdade no servidor.
 *
 * A rota "/" (splash) fica pública de propósito: a splash é a experiência de
 * entrada pedida no design e ela mesma decide o destino com a sessão do
 * navegador (leitura local, sem round-trip). Verificar aqui anularia a splash
 * para quem já está logado.
 */

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const ANON_KEY_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const SUPABASE_CONFIGURADO = Boolean(URL_SUPABASE && ANON_KEY_SUPABASE);

/** Cookie do "modo demonstração" (ver lib/modo-demo-cookie.ts) — permite o ciclo
 *  de validação visual (decisão 7B) sem usuário real cadastrado. O banco continua
 *  negando tudo por RLS, então não há exposição de dados de pacientes. */

/** Rotas acessíveis sem sessão. Qualquer outra exige autenticação. */
const ROTAS_PUBLICAS = new Set(['/', '/login']);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ehApi = pathname.startsWith('/api');
  const ehRotaPublica = ROTAS_PUBLICAS.has(pathname);
  const emModoDemo = request.cookies.get(COOKIE_MODO_DEMO)?.value === '1';

  // Resposta que carrega os cookies renovados (substituída no setAll abaixo).
  let resposta = NextResponse.next({ request });

  let autenticado = emModoDemo;

  // Só toca a rede do Supabase quando a decisão depende dela: rotas internas,
  // /login (para tirar o logado da tela de login) e /api/*.
  const precisaVerificar =
    SUPABASE_CONFIGURADO && (ehApi || !ehRotaPublica || pathname === '/login');

  if (precisaVerificar) {
    const supabase = createServerClient(URL_SUPABASE, ANON_KEY_SUPABASE, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Propaga os cookies renovados para a requisição (páginas) e para a
          // resposta (navegador).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            resposta.cookies.set(name, value, options);
          });
        },
      },
    });

    try {
      const { data } = await supabase.auth.getUser();
      autenticado = Boolean(data.user) || emModoDemo;
    } catch {
      // Falha de rede/DNS ao validar o token: trata como não autenticado
      // (fail-closed) — melhor pedir login de novo que servir dado protegido.
      autenticado = emModoDemo;
    }
  }

  // 1) API interna: 401 em JSON (nunca redirect, que quebraria o fetch)
  if (ehApi) {
    if (!autenticado) {
      return NextResponse.json(
        { error: 'Não autenticado. Faça login para usar este recurso.' },
        { status: 401 }
      );
    }
    return resposta;
  }

  // 2) Usuário com sessão não deve ver a tela de login
  if (pathname === '/login' && autenticado) {
    return NextResponse.redirect(new URL('/painel', request.url));
  }

  // 3) Rota interna sem sessão → login, guardando o destino
  if (!ehRotaPublica && !autenticado) {
    const destino = new URL('/login', request.url);
    destino.searchParams.set('redirect', pathname + (request.nextUrl.search || ''));
    return NextResponse.redirect(destino);
  }

  // 4) Rota interna sem Supabase configurado (build local incompleto):
  //    manda para o login, que explica o que falta em vez de renderizar um
  //    painel vazio.
  if (!SUPABASE_CONFIGURADO && !ehRotaPublica && !emModoDemo) {
    const destino = new URL('/login', request.url);
    destino.searchParams.set('motivo', 'sem_configuracao');
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  // Roda em tudo, exceto assets estáticos e imagens do Next.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)',
  ],
};