import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Perfil de acesso do usuário logado (decisão 2A + migration 0003).
 *
 * Fonte única para a checagem de acesso: a linha em public.perfis diz o papel
 * (recepcionista/dentista) e se o acesso está ativo. Sem perfil ou com
 * ativo = false, a RLS do banco nega tudo — então a UI precisa bloquear ANTES
 * de mostrar qualquer tela interna, em vez de exibir um painel vazio.
 */

export type Papel = 'recepcionista' | 'dentista';

export interface Perfil {
  user_id: string;
  role: Papel;
  nome_completo: string | null;
  ativo: boolean;
}

export type ResultadoPerfil =
  | { ok: true; perfil: Perfil }
  | { ok: false; motivo: 'sem_configuracao' | 'sem_sessao' | 'sem_perfil' | 'inativo' | 'erro'; mensagem: string };

/** Rótulo amigável do papel, para exibir na interface. */
export function rotuloPapel(role: Papel): string {
  return role === 'dentista' ? 'Dentista' : 'Recepção';
}

/** Primeira letra do nome (avatar) — cai no e-mail quando não há nome. */
export function inicialDoPerfil(perfil: Perfil, email?: string | null): string {
  const base = (perfil.nome_completo || email || '?').trim();
  return base.charAt(0).toUpperCase() || '?';
}

export async function carregarMeuPerfil(): Promise<ResultadoPerfil> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      motivo: 'sem_configuracao',
      mensagem:
        'Supabase não configurado neste ambiente — preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  const { data: sessao } = await supabase.auth.getSession();
  const usuario = sessao.session?.user;
  if (!usuario) {
    return { ok: false, motivo: 'sem_sessao', mensagem: 'Sessão expirada — faça login novamente.' };
  }

  const { data, error } = await supabase
    .from('perfis')
    .select('user_id, role, nome_completo, ativo')
    .eq('user_id', usuario.id)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      motivo: 'erro',
      mensagem: /network|fetch/i.test(error.message)
        ? 'Não foi possível alcançar o Supabase — verifique a conexão.'
        : `Falha ao ler o perfil de acesso: ${error.message}`,
    };
  }

  if (!data) {
    return {
      ok: false,
      motivo: 'sem_perfil',
      mensagem:
        'Seu usuário não tem perfil de acesso cadastrado. Peça ao administrador para liberar a linha correspondente na tabela "perfis".',
    };
  }

  const perfil = data as Perfil;

  if (!perfil.ativo) {
    return {
      ok: false,
      motivo: 'inativo',
      mensagem: 'Acesso desativado. Fale com a administradora do consultório para reativar seu usuário.',
    };
  }

  return { ok: true, perfil };
}

/**
 * Encerra a sessão e limpa o modo demonstração. Chamado pelo botão "Sair"
 * (sidebar e header) — depois o proxy.ts volta a exigir login em /painel.
 */
export async function encerrarSessao(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Token já inválido no servidor: segue para o logout local.
  }
}