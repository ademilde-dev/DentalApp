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
  confirmada: 'Registra que o paciente confirmou presença (véspera) — não altera o retorno do recall.',
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
// ============================================================================
// AGENDAMENTO E GESTÃO DE CONSULTAS (fase "Agendar Consulta" → public.consultas)
// ----------------------------------------------------------------------------
// Complementa marcarStatusConsulta() com o que o modal 'Agendar Consulta' e a
// aba "Agenda & Consultas" precisam:
//   - carregarConsultas(): lista completa com joins (paciente/dentista/
//     procedimento) já no formato da UI, com data/hora no fuso America/Sao_Paulo
//     (decisão 4A — o cliente projeta o timestamptz para SP com Intl).
//   - criarConsulta()/atualizarConsulta(): INSERT/UPDATE com SELECT de volta,
//     detectando RLS (zero linhas) e FK inválida (23503).
// ============================================================================

export type StatusConsultaUI = 'scheduled' | 'confirmed' | 'completed' | 'missed' | 'canceled';

/** Status do formulário (UI) → valor aceito pelo CHECK de public.consultas. */
export const STATUS_UI_PARA_BANCO: Record<StatusConsultaUI, StatusConsulta> = {
  scheduled: 'agendada',
  confirmed: 'confirmada',
  completed: 'concluida',
  missed: 'faltou',
  canceled: 'cancelada',
};

/** Status do banco → status usado pela aba Agenda (badges/dots). */
export const STATUS_BANCO_PARA_UI: Record<StatusConsulta, StatusConsultaUI> = {
  agendada: 'scheduled',
  confirmada: 'confirmed',
  concluida: 'completed',
  faltou: 'missed',
  cancelada: 'canceled',
};

/** Formato que a aba Agenda & Consultas (app/painel/page.tsx) espera. */
export interface ConsultaAgenda {
  id: string;
  patientId: string;
  pacienteNome: string | null;
  dentist: string;
  dentistId: string | null;
  procedimentoNome: string | null;
  procedureId: string | null;
  /** Valor exibido no agendamento — a v1 deixa '' e a UI usa o preço do procedimento. */
  value: string;
  /** 'YYYY-MM-DD' no fuso America/Sao_Paulo. */
  date: string;
  /** 'HH:MM' no fuso America/Sao_Paulo. */
  time: string;
  status: StatusConsultaUI;
  /** timestamptz original (para futura edição sem nova projeção). */
  dataISO: string;
}

/** Linha de public.consultas com os joins embutidos (PostgREST embed). */
export interface LinhaConsultaBanco {
  id: string;
  data: string;
  status: StatusConsulta;
  paciente_id: string;
  procedimento_id: string | null;
  dentista_id: string | null;
  pacientes: { id: string; nome: string; telefone: string | null } | null;
  procedimentos: { id: string; nome: string; preco: number | null } | null;
  dentistas: { id: string; nome: string } | null;
}

export interface ResultadoConsultas {
  ok: boolean;
  consultas: ConsultaAgenda[];
  mensagem: string | null;
}

export interface ResultadoEscritaConsulta {
  ok: boolean;
  consulta: ConsultaAgenda | null;
  /** true quando a RLS impediu a escrita (ex.: perfil dentista). */
  semPermissao: boolean;
  mensagem: string | null;
}

/** Campos que o modal 'Agendar Consulta' envia ao banco. */
export interface NovaConsulta {
  pacienteId: string;
  dentistaId: string | null;
  procedimentoId: string | null;
  /** 'YYYY-MM-DD' (fuso do consultório = America/Sao_Paulo). */
  data: string;
  /** 'HH:MM' (fuso do consultório). */
  hora: string;
  status: StatusConsultaUI;
}

const SELECT_CONSULTA = `id, data, status, paciente_id, procedimento_id, dentista_id,
  pacientes(id, nome, telefone),
  procedimentos(id, nome, preco),
  dentistas(id, nome)`;
/** Projeta o timestamptz para a data/hora de America/Sao_Paulo (decisão 4A). */
function projetarSP(iso: string): { data: string; hora: string } {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const pegar = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return {
    data: `${pegar('year')}-${pegar('month')}-${pegar('day')}`,
    hora: `${pegar('hour')}:${pegar('minute')}`,
  };
}

/** Banco -> UI (aba Agenda). */
export function linhaParaConsultaAgenda(linha: LinhaConsultaBanco): ConsultaAgenda {
  const sp = projetarSP(linha.data);
  return {
    id: linha.id,
    patientId: linha.paciente_id,
    pacienteNome: linha.pacientes?.nome ?? null,
    dentist: linha.dentistas?.nome ?? 'Profissional não informado',
    dentistId: linha.dentista_id,
    procedimentoNome: linha.procedimentos?.nome ?? null,
    procedureId: linha.procedimento_id,
    value: '',
    date: sp.data,
    time: sp.hora,
    status: STATUS_BANCO_PARA_UI[linha.status] ?? 'scheduled',
    dataISO: linha.data,
  };
}

/** Lista completa de consultas (a aba Agenda filtra por data client-side). */
export async function carregarConsultas(): Promise<ResultadoConsultas> {
  const { data, error } = await supabase
    .from('consultas')
    .select(SELECT_CONSULTA)
    .order('data', { ascending: false });

  if (error) {
    return { ok: false, consultas: [], mensagem: `Não foi possível carregar as consultas: ${error.message}` };
  }
  return { ok: true, consultas: (data ?? []).map((l) => linhaParaConsultaAgenda(l as unknown as LinhaConsultaBanco)), mensagem: null };
}

/** Monta o timestamptz a partir de data/hora do fuso do consultório (UTC-3 fixo). */
function momentoSP(data: string, hora: string): Date {
  return new Date(`${data}T${hora}:00-03:00`);
}
export async function criarConsulta(nova: NovaConsulta): Promise<ResultadoEscritaConsulta> {
  const instante = momentoSP(nova.data, nova.hora);
  if (Number.isNaN(instante.getTime())) {
    return { ok: false, consulta: null, semPermissao: false, mensagem: `Data/hora inválidas: ${nova.data} ${nova.hora}.` };
  }

  const { data, error } = await supabase
    .from('consultas')
    .insert({
      paciente_id: nova.pacienteId,
      dentista_id: nova.dentistaId,
      procedimento_id: nova.procedimentoId,
      data: instante.toISOString(),
      status: STATUS_UI_PARA_BANCO[nova.status] ?? 'agendada',
    })
    .select(SELECT_CONSULTA)
    .single();

  if (error) {
    const semPermissao = erroSemPermissaoConsulta(error);
    return {
      ok: false,
      consulta: null,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil não tem permissão para agendar consultas (apenas Recepção).'
        : mensagemErroConsulta(error),
    };
  }
  return { ok: true, consulta: linhaParaConsultaAgenda(data as unknown as LinhaConsultaBanco), semPermissao: false, mensagem: null };
}

export async function atualizarConsulta(id: string, nova: NovaConsulta): Promise<ResultadoEscritaConsulta> {
  const instante = momentoSP(nova.data, nova.hora);
  if (Number.isNaN(instante.getTime())) {
    return { ok: false, consulta: null, semPermissao: false, mensagem: `Data/hora inválidas: ${nova.data} ${nova.hora}.` };
  }

  const { data, error } = await supabase
    .from('consultas')
    .update({
      paciente_id: nova.pacienteId,
      dentista_id: nova.dentistaId,
      procedimento_id: nova.procedimentoId,
      data: instante.toISOString(),
      status: STATUS_UI_PARA_BANCO[nova.status] ?? 'agendada',
    })
    .eq('id', id)
    .select(SELECT_CONSULTA);

  if (error) {
    const semPermissao = erroSemPermissaoConsulta(error);
    return {
      ok: false,
      consulta: null,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil não tem permissão para editar consultas (apenas Recepção).'
        : mensagemErroConsulta(error),
    };
  }
  // RLS barrando um update não gera erro: gera zero linhas (padrão do arquivo).
  if (!data || data.length === 0) {
    return {
      ok: false,
      consulta: null,
      semPermissao: true,
      mensagem: 'Nenhuma consulta foi alterada — verifique se ela ainda existe e o seu perfil.',
    };
  }
  return { ok: true, consulta: linhaParaConsultaAgenda(data[0] as unknown as LinhaConsultaBanco), semPermissao: false, mensagem: null };
}

function erroSemPermissaoConsulta(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message || '');
}

function mensagemErroConsulta(error: { code?: string; message?: string }): string {
  if (error.code === '23503') {
    return 'O paciente, o procedimento ou o dentista selecionado não existe mais no banco — recarregue a página e tente de novo.';
  }
  return `Não foi possível salvar a consulta: ${error.message}`;
}