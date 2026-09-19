/**
 * Ações de status da consulta (T6) — a ponte entre a UI e o gatilho do recall.
 *
 * Concluir uma consulta faz o trigger `fn_gerenciar_retorno` (decisão 1A) criar
 * ou estender a linha em `retornos`; cancelar anula o retorno pendente que veio
 * dela. Por isso, logo após alterar o status, o Painel do Dia recarrega: o
 * retorno aparece (ou desaparece) da lista de reativações sem refresh manual —
 * é exatamente o critério de verificação da T6 no design.
 *
 * Permissões (RLS 2A): `recepcionista` atualiza qualquer consulta; `dentista`
 * também, mas apenas no fluxo de conclusão (policy `consultas_dentista_concluir`).
 * Um update barrado pela RLS não devolve erro — devolve zero linhas, e é isso
 * que a UI precisa detectar para dizer "sem permissão" em vez de "sucesso".
 */
import { supabase } from './supabase';

export type StatusConsulta = 'agendada' | 'confirmada' | 'concluida' | 'faltou' | 'cancelada';

export interface ResultadoStatusConsulta {
  ok: boolean;
  /** Mensagem pronta para exibir (null quando ok). */
  mensagem: string | null;
  /** true quando a RLS impediu a alteração (perfil sem permissão). */
  semPermissao: boolean;
}

export const ROTULO_STATUS_CONSULTA: Record<StatusConsulta, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  concluida: 'Concluída',
  faltou: 'Faltou',
  cancelada: 'Cancelada',
};

/** Detalhe para o title="" dos botões — explica o efeito no recall. */
export const EFEITO_NO_RETORNO: Partial<Record<StatusConsulta, string>> = {
  concluida: 'Marca como concluída e gera o retorno na lista de reativações (janela do procedimento ou 180 dias).',
  cancelada: 'Cancela a consulta e anula o retorno pendente que ela havia gerado.',
};

export async function marcarStatusConsulta(
  consultaId: string,
  status: StatusConsulta
): Promise<ResultadoStatusConsulta> {
  const { data, error } = await supabase
    .from('consultas')
    .update({ status })
    .eq('id', consultaId)
    .select('id');

  if (error) {
    const semPermissao =
      error.code === '42501' || /permission denied|row-level security/i.test(error.message || '');
    return {
      ok: false,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil não tem permissão para alterar o status desta consulta.'
        : `Não foi possível atualizar a consulta: ${error.message}`,
    };
  }

  // RLS barrando um update não gera erro: gera zero linhas afetadas.
  if (!data || data.length === 0) {
    return {
      ok: false,
      semPermissao: true,
      mensagem: 'Nenhuma linha foi alterada — verifique se a consulta ainda existe e se o seu perfil tem permissão.',
    };
  }

  return { ok: true, mensagem: null, semPermissao: false };
}