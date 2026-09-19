import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase do lado servidor (Server Components, Route Handlers).
 *
 * Diferente do cliente de navegador (lib/supabase.ts), este lê e escreve a
 * sessão via cookies do Next.js — é o que permite ao servidor saber quem está
 * logado antes do primeiro byte e o que sustenta o proxy.ts (middleware).
 *
 * IMPORTANTE: crie um cliente novo a cada render/requisição. Nunca reutilize
 * esta instância entre requisições (vazamento de sessão entre usuários).
 *
 * Enquanto as credenciais não estiverem no .env.local, devolve um cliente com
 * valores placeholder (nenhuma rede é tocada até a primeira chamada) — o mesmo
 * comportamento resiliente de lib/supabase.ts, para não quebrar o build da
 * Vercel nem o dev server.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

/** Exportado também em lib/supabase.ts (mesma fonte: variáveis NEXT_PUBLIC_*). */
export const isSupabaseConfiguredNoServidor = Boolean(supabaseUrl && supabaseAnonKey);

export async function criarClienteServidor(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component não pode escrever cookies na resposta. O refresh
            // do token é responsabilidade do proxy.ts, que roda antes da página.
          }
        },
      },
    }
  );
}