/**
 * Procedimentos (public.procedimentos) — fonte de verdade do catálogo usado
 * pelo modal 'Agendar Consulta' e pela aba Procedimentos (migração da fase
 * em que isso vivia no localStorage `of_procedures`).
 *
 * Mapeamento: `nome` ⇄ `name`, `preco` ⇄ `price` (coluna adicionada na
 * migração 0005), `janela_retorno_dias` → janela do recall 1A.
 *
 * Permissões (RLS 2A): `recepcionista` lê/escreve tudo; `dentista` só lê.
 * Um update/delete barrado pela RLS devolve zero linhas (não erro) — a UI
 * trata isso como "sem permissão", no mesmo padrão de lib/pacientes.ts.
 */
import { supabase } from './supabase';

/** Formato da UI (aba Procedimentos e modal de agendamento). */
export interface Procedimento {
  id: string;
  name: string;
  price: number;
  janelaRetornoDias: number;
}

/** Linha de `public.procedimentos`. */
export interface LinhaProcedimento {
  id: string;
  nome: string;
  preco: number | null;
  janela_retorno_dias: number | null;
}

export interface ResultadoProcedimentos {
  ok: boolean;
  procedimentos: Procedimento[];
  mensagem: string | null;
}

export interface ResultadoEscritaProcedimento {
  ok: boolean;
  procedimento: Procedimento | null;
  /** true quando a RLS impediu a escrita (ex.: perfil dentista). */
  semPermissao: boolean;
  mensagem: string | null;
}

function erroSemPermissao(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message || '');
}

/** Banco -> UI. */
export function linhaParaProcedimento(linha: LinhaProcedimento): Procedimento {
  return {
    id: linha.id,
    name: linha.nome,
    price: typeof linha.preco === 'number' ? linha.preco : Number(linha.preco ?? 0),
    janelaRetornoDias: typeof linha.janela_retorno_dias === 'number' ? linha.janela_retorno_dias : 180,
  };
}

/** UI -> banco. */
function procedimentoParaLinha(p: { name: string; price: number }): { nome: string; preco: number } {
  return { nome: p.name.trim(), preco: p.price };
}

/** Catálogo em ordem alfabética (a busca textual da aba segue client-side). */
export async function carregarProcedimentos(): Promise<ResultadoProcedimentos> {
  const { data, error } = await supabase
    .from('procedimentos')
    .select('id, nome, preco, janela_retorno_dias')
    .order('nome');

  if (error) {
    return { ok: false, procedimentos: [], mensagem: `Não foi possível carregar os procedimentos: ${error.message}` };
  }
  return {
    ok: true,
    procedimentos: (data ?? []).map((l) => linhaParaProcedimento(l as LinhaProcedimento)),
    mensagem: null,
  };
}

export async function criarProcedimento(p: { name: string; price: number }): Promise<ResultadoEscritaProcedimento> {
  const { data, error } = await supabase
    .from('procedimentos')
    .insert(procedimentoParaLinha(p))
    .select('id, nome, preco, janela_retorno_dias')
    .single();

  if (error) {
    const semPermissao = erroSemPermissao(error);
    return {
      ok: false,
      procedimento: null,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil não tem permissão para cadastrar procedimentos (apenas Recepção).'
        : `Não foi possível cadastrar o procedimento: ${error.message}`,
    };
  }
  return { ok: true, procedimento: linhaParaProcedimento(data as LinhaProcedimento), semPermissao: false, mensagem: null };
}
export async function atualizarProcedimento(
  id: string,
  p: { name: string; price: number }
): Promise<ResultadoEscritaProcedimento> {
  const { data, error } = await supabase
    .from('procedimentos')
    .update(procedimentoParaLinha(p))
    .eq('id', id)
    .select('id, nome, preco, janela_retorno_dias');

  if (error) {
    const semPermissao = erroSemPermissao(error);
    return {
      ok: false,
      procedimento: null,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil não tem permissão para editar procedimentos (apenas Recepção).'
        : `Não foi possível salvar o procedimento: ${error.message}`,
    };
  }
  // RLS barrando um update não gera erro: gera zero linhas (padrão lib/consultas.ts).
  if (!data || data.length === 0) {
    return {
      ok: false,
      procedimento: null,
      semPermissao: true,
      mensagem: 'Nenhum procedimento foi alterado — verifique o registro e o seu perfil.',
    };
  }
  return { ok: true, procedimento: linhaParaProcedimento(data[0] as LinhaProcedimento), semPermissao: false, mensagem: null };
}

/** Quantas consultas vinculadas existem (FK é ON DELETE SET NULL). */
export async function contarConsultasDoProcedimento(procedimentoId: string): Promise<{ total: number; erro: string | null }> {
  const { count, error } = await supabase
    .from('consultas')
    .select('id', { count: 'exact', head: true })
    .eq('procedimento_id', procedimentoId);
  if (error) return { total: 0, erro: error.message };
  return { total: count ?? 0, erro: null };
}

export async function excluirProcedimento(procedimentoId: string): Promise<ResultadoEscritaProcedimento> {
  const vinculo = await contarConsultasDoProcedimento(procedimentoId);
  if (vinculo.erro) {
    return { ok: false, procedimento: null, semPermissao: false, mensagem: `Não foi possível verificar as consultas do procedimento: ${vinculo.erro}` };
  }
  if (vinculo.total > 0) {
    return {
      ok: false,
      procedimento: null,
      semPermissao: false,
      mensagem: `Não é possível remover este procedimento pois ele possui ${vinculo.total} consulta(s) vinculada(s) (a exclusão apagaria o vínculo do histórico).`,
    };
  }

  const { data, error } = await supabase.from('procedimentos').delete().eq('id', procedimentoId).select('id');
  if (error) {
    const semPermissao = erroSemPermissao(error);
    return {
      ok: false,
      procedimento: null,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil não tem permissão para excluir procedimentos (apenas Recepção).'
        : `Não foi possível excluir o procedimento: ${error.message}`,
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      procedimento: null,
      semPermissao: true,
      mensagem: 'Nenhum procedimento foi excluído — verifique se ele ainda existe e o seu perfil.',
    };
  }
  return { ok: true, procedimento: null, semPermissao: false, mensagem: null };
}