/**
 * Dentistas do consultório (public.dentistas) — fonte para o select de
 * profissional do modal 'Agendar Consulta' e para o filtro da aba Agenda.
 *
 * Permissões (RLS 2A): `recepcionista` lê/escreve tudo; `dentista` só lê.
 * A tabela é cadastrada pela administradora (SQL Editor / migração 0005) —
 * a v1 não tem tela de gestão de dentistas.
 */
import { supabase } from './supabase';

/** Formato da UI (select do modal e filtro da agenda). */
export interface Dentista {
  id: string;
  nome: string;
  ativo: boolean;
}

/** Linha de `public.dentistas` (somente as colunas que a UI lê). */
export interface LinhaDentista {
  id: string;
  nome: string;
  ativo: boolean | null;
  user_id: string | null;
}

export interface ResultadoDentistas {
  ok: boolean;
  dentistas: Dentista[];
  mensagem: string | null;
}

function linhaParaDentista(linha: LinhaDentista): Dentista {
  return {
    id: linha.id,
    nome: linha.nome,
    ativo: linha.ativo !== false,
  };
}

/** Todos os dentistas ativos, em ordem alfabética (a busca é client-side). */
export async function carregarDentistas(): Promise<ResultadoDentistas> {
  const { data, error } = await supabase
    .from('dentistas')
    .select('id, nome, ativo')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    return { ok: false, dentistas: [], mensagem: `Não foi possível carregar os dentistas: ${error.message}` };
  }
  return { ok: true, dentistas: (data ?? []).map((l) => linhaParaDentista(l as LinhaDentista)), mensagem: null };
}