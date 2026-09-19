/**
 * Camada de dados do Painel do Dia (T5) — consome a RPC única carregar_painel()
 * (decisão 8A) e o update de retorno para "contatado" (test plan, interação 2).
 *
 * Erros são tipados para a UI mostrar estado claro em vez de tela branca
 * (test plan: "Supabase inacessível: mensagem de erro clara").
 */
import { supabase, isSupabaseConfigured } from './supabase';

export interface AlertasSaude {
  alergias?: string;
  hipertensao?: boolean;
  diabetes?: boolean;
  medicacoes?: string;
  observacoes?: string;
  [chave: string]: unknown;
}

/** Linha de vw_confirmacoes_amanha (4A) */
export interface ConfirmacaoAmanha {
  consulta_id: string;
  data: string;
  data_sp: string;
  hora_sp: string;
  status: string;
  dentista_nome: string | null;
  procedimento_nome: string | null;
  paciente_id: string;
  paciente_nome: string;
  telefone: string | null;
  tem_telefone: boolean;
  alertas_saude: AlertasSaude | null;
}

/** Linha de vw_reativacoes_semana (4A + 6A) */
export interface ReativacaoSemana {
  retorno_id: string;
  paciente_id: string;
  paciente_nome: string;
  telefone: string | null;
  tem_telefone: boolean;
  alertas_saude: AlertasSaude | null;
  elegivel_apos: string;
  retorno_status: 'pendente' | 'contatado' | 'reagendado' | 'sem_interesse';
  atualizado_em: string;
  consulta_origem_id: string | null;
  consulta_origem_data: string | null;
  consulta_origem_data_sp: string | null;
  procedimento_nome: string | null;
  recontatar: boolean;
}

/** Linha de vw_agenda_hoje (4A) */
export interface AgendaHoje {
  consulta_id: string;
  data: string;
  data_sp: string;
  hora_sp: string;
  status: string;
  dentista_id: string | null;
  dentista_nome: string | null;
  procedimento_nome: string | null;
  paciente_id: string;
  paciente_nome: string;
  telefone: string | null;
  tem_telefone: boolean;
  alertas_saude: AlertasSaude | null;
}

/** Formato de retorno da RPC carregar_painel() (8A) */
export interface Painel {
  gerado_em_sp?: string;
  confirmacoes_amanha: ConfirmacaoAmanha[];
  reativacoes_semana: ReativacaoSemana[];
  agenda_hoje: AgendaHoje[];
}

export interface ErroPainel {
  tipo: 'sem_configuracao' | 'sem_sessao' | 'rede' | 'desconhecido';
  mensagem: string;
}

/**
 * As 3 listas em 1 round-trip (8A).
 * - 'sem_sessao': execute da RPC exige usuário autenticado (T4 Supabase Auth).
 * - 'rede'/'desconhecido': a UI mostra erro claro + retry (test plan).
 */
export async function carregarPainel(): Promise<{ painel: Painel | null; erro: ErroPainel | null }> {
  if (!isSupabaseConfigured) {
    return {
      painel: null,
      erro: {
        tipo: 'sem_configuracao',
        mensagem: 'Supabase não configurado — preencha o .env.local e reinicie o dev server.',
      },
    };
  }

  const { data, error } = await supabase.rpc('carregar_painel');

  if (error) {
    const msg = error.message || 'Falha ao carregar o painel.';
    const semSessao =
      error.code === '42501' || /permission denied|row-level security|jwt/i.test(msg);
    return {
      painel: null,
      erro: semSessao
        ? {
            tipo: 'sem_sessao',
            mensagem: 'Sem sessão no Supabase Auth — faça login para ver os dados reais.',
          }
        : {
            tipo: typeof navigator !== 'undefined' && !navigator.onLine ? 'rede' : 'desconhecido',
            mensagem: msg,
          },
    };
  }

  const painel = data as Painel;
  return {
    painel: {
      gerado_em_sp: painel?.gerado_em_sp,
      confirmacoes_amanha: painel?.confirmacoes_amanha ?? [],
      reativacoes_semana: painel?.reativacoes_semana ?? [],
      agenda_hoje: painel?.agenda_hoje ?? [],
    },
    erro: null,
  };
}

/** Marca o retorno como 'contatado' (recepcionista tem permissão pela RLS 2A). */
export async function marcarContatado(retornoId: string): Promise<{ erro: string | null }> {
  const { error } = await supabase.from('retornos').update({ status: 'contatado' }).eq('id', retornoId);
  return { erro: error?.message ?? null };
}
