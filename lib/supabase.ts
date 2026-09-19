import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase compartilhado do DentalApp.
 *
 * Design: docs/designs/fabio-main-design-20260918-2150.md — seção
 * "Architecture: Migração Firestore → Supabase": um único cliente Supabase
 * instanciado em lib compartilhada, usado por todas as páginas/rotas do Next.js.
 *
 * As credenciais vêm de variáveis públicas de ambiente (NEXT_PUBLIC_*) definidas
 * no .env.local — nunca de arquivos de configuração versionados.
 *
 * Enquanto as credenciais não forem preenchidas, o cliente é criado com valores
 * placeholder (nenhuma rede é acessada até a primeira query) para não derrubar o
 * dev server; use `isSupabaseConfigured` para as telas detectarem o estado e
 * mostrarem uma mensagem clara em vez de um erro de rede.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

/** Indica se as credenciais do Supabase já foram preenchidas no .env.local. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] Credenciais ausentes. Preencha NEXT_PUBLIC_SUPABASE_URL e ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local e reinicie o dev server (npm run dev).'
  );
}

export const supabase: SupabaseClient = createBrowserClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    // isSingleton = false: cada chamada devolve um cliente novo, sem cache de
    // módulo — necessário porque este arquivo é avaliado também no servidor
    // (componentes 'use client' são pré-renderizados). A sessão vive em cookie
    // (base64url), o que permite ao proxy.ts (middleware) renová-la e ao
    // servidor decidir o redirect antes do primeiro byte.
    isSingleton: false,
  }
);
