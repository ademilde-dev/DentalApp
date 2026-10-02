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

/**
 * FONTE PRIMÁRIA DE VERDADE (regra):
 * - Supabase (`public.pacientes`, `public.procedimentos`, `public.consultas`,
 *   `public.retornos`, `public.perfis`, `public.dentistas`) é a única fonte de
 *   verdade do sistema de dados do DentalApp.
 * - O banco hospedado (DentalAppBD, sa-east-1) é o estado durável da aplicação:
 *   qualquer listagem, cadastro, edição ou exclusão de Pacientes / Procedimentos
 *   / Consultas deve ocorrer neste banco (ativação / persistência imediata no
 *   server hospedado, com RLS e triggers no lugar).
 * - O `localStorage` do navegador é delimitado para estado de interface local:
 *   preferências visuais, aba ativa, rascunhos de formulário, entre outros.
 * - Dados locais em memória ou no `localStorage` NÃO devem sobrescrever,
 *   substituir ou conflitar com os registros retornados pelo Supabase.
 *   Ouve-se: se o Supabase devolveu um conjunto de registros para a tabela,
 *   a UI usa esse conjunto; o cache local é usado somente após falha de rede ou
 *   como draft temporário antes de persistir (mesmo assim, o draft depois é
 *   descartado ou conflitado com o estado real).
 * - O cliente Supabase compartilhado (`lib/supabase.ts`) sempre le na origem
 *   remota; nunca consulta localStorage para decidir qual paciente/procedimento
 *   existe. O estado transitório drive, aqui, é o localStorage quando necessário
 *   (acesso desatualizado do Google Drive), não dados normativos.
 * - Mesmo no modo demo, que não tenta conectar no banco (ver `painel-demo.{ts,mjs}`),
 *   os dados servem apenas para mock visual; nunca são livros como "decisões de T2
 *   aplicadas e persistidas"; após o desligamento do demo, o sistema volta a
 *   consultar o banco.
 */


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
