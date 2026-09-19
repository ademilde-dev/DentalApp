/**
 * Fichas de Pacientes no Supabase (migracao localStorage -> Postgres).
 *
 * Cenario: a aba Pacientes vivia 100% em `localStorage` (`of_patients`) e a
 * tabela `public.pacientes` ficava vazia ("No rows"). Esta camada liga a UI ao
 * banco com o mesmo padrao de `lib/consultas.ts` (update barrado pela RLS
 * devolve zero linhas, nao erro).
 *
 * Mapeamento - o schema (0001_init) tem so `nome | telefone | alertas_saude`:
 * - `nome` ⇄ `name`, `telefone` ⇄ `phone`;
 * - chaves clinicas (alergias, hipertensao, diabetes, medicacoes,
 *   observacoes) continuam no topo de `alertas_saude` para as views do
 *   Painel do Dia seguirem funcionando sem mudanca;
 * - demais campos da ficha (cpf, nascimento, genero, e-mail, notas clinicas,
 *   observacoes da anamnese) viajam num envelope `ficha` no mesmo jsonb -
 *   sem migracao de colunas, sem quebrar as views. Se um dia essas colunas
 *   forem promovidas, basta ajustar `linhaParaPaciente`/`pacienteParaLinha`
 *   aqui (o contrato com a UI nao muda).
 *
 * Permissoes (RLS 2A): `recepcionista` le/escreve tudo; `dentista` so le.
 * Se uma escrita for barrada, o retorno `semPermissao` explica em vez de
 * fingir "sucesso".
 *
 * Modo demonstracao: continua 100% local (mocks + localStorage) e nunca toca
 * o Supabase - ver `lib/painel-demo.ts` (decisao 7B).
 */
import { supabase } from './supabase';

/** Formato da ficha como a aba Pacientes (`app/painel/page.tsx`) a usa. */
export interface Paciente {
  id: string;
  name: string;
  cpf: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  medicalHistory: {
    allergies: string;
    hypertension: boolean;
    diabetes: boolean;
    meds: string;
    notes: string;
  };
  clinicalNotes: string;
}

/** Linha de `public.pacientes` (so as colunas que a UI le/escreve). */
export interface LinhaPaciente {
  id: string;
  nome: string;
  telefone: string | null;
  alertas_saude: Record<string, unknown> | null;
}

export interface ResultadoPacientes {
  ok: boolean;
  pacientes: Paciente[];
  mensagem: string | null;
}

export interface ResultadoEscritaPaciente {
  ok: boolean;
  paciente: Paciente | null;
  /** true quando a RLS impediu a escrita (ex.: perfil dentista). */
  semPermissao: boolean;
  mensagem: string | null;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const logico = (v: unknown): boolean => v === true;

function lerFicha(alertas: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!alertas) return {};
  const ficha = (alertas as Record<string, unknown>).ficha;
  return ficha && typeof ficha === 'object' ? (ficha as Record<string, unknown>) : {};
}

/** Banco -> UI. Tolera linhas legadas sem o envelope `ficha`. */
export function linhaParaPaciente(linha: LinhaPaciente): Paciente {
  const alertas = (linha.alertas_saude ?? {}) as Record<string, unknown>;
  const ficha = lerFicha(alertas);
  return {
    id: linha.id,
    name: linha.nome ?? '',
    cpf: texto(ficha.cpf),
    dob: texto(ficha.data_nascimento),
    gender: texto(ficha.genero),
    phone: linha.telefone ?? '',
    email: texto(ficha.email),
    medicalHistory: {
      allergies: texto(alertas.alergias),
      hypertension: logico(alertas.hipertensao),
      diabetes: logico(alertas.diabetes),
      meds: texto(alertas.medicacoes),
      notes: texto(ficha.anamnese_observacoes ?? alertas.observacoes),
    },
    clinicalNotes: texto(ficha.notas_clinicas),
  };
}

/** UI -> Banco. Clinico no topo (views do Painel); resto no envelope `ficha`. */
export function pacienteParaLinha(p: Omit<Paciente, 'id'> | Paciente): {
  nome: string;
  telefone: string | null;
  alertas_saude: Record<string, unknown>;
} {
  return {
    nome: p.name.trim(),
    telefone: p.phone.trim() || null,
    alertas_saude: {
      alergias: p.medicalHistory.allergies.trim(),
      hipertensao: p.medicalHistory.hypertension,
      diabetes: p.medicalHistory.diabetes,
      medicacoes: p.medicalHistory.meds.trim(),
      observacoes: p.medicalHistory.notes.trim(),
      ficha: {
        cpf: p.cpf.trim(),
        data_nascimento: p.dob,
        genero: p.gender,
        email: p.email.trim(),
        anamnese_observacoes: p.medicalHistory.notes.trim(),
        notas_clinicas: p.clinicalNotes,
      },
    },
  };
}

function erroSemPermissao(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42501' || /permission denied|row-level security/i.test(error.message || '');
}



/** Le todas as fichas, em ordem alfabetica (a busca textual segue client-side). */
export async function carregarPacientes(): Promise<ResultadoPacientes> {
  const { data, error } = await supabase
    .from('pacientes')
    .select('id, nome, telefone, alertas_saude')
    .order('nome');

  if (error) {
    return { ok: false, pacientes: [], mensagem: `Nao foi possivel carregar os pacientes: ${error.message}` };
  }
  return { ok: true, pacientes: (data ?? []).map(linhaParaPaciente), mensagem: null };
}

export async function criarPaciente(p: Omit<Paciente, 'id'>): Promise<ResultadoEscritaPaciente> {
  const { data, error } = await supabase
    .from('pacientes')
    .insert(pacienteParaLinha(p))
    .select('id, nome, telefone, alertas_saude')
    .single();

  if (error) {
    const semPermissao = erroSemPermissao(error);
    return {
      ok: false,
      paciente: null,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil nao tem permissao para cadastrar pacientes (apenas Recepcao).'
        : `Nao foi possivel cadastrar o paciente: ${error.message}`,
    };
  }
  return { ok: true, paciente: linhaParaPaciente(data as LinhaPaciente), semPermissao: false, mensagem: null };
}

export async function atualizarPaciente(p: Paciente): Promise<ResultadoEscritaPaciente> {
  const { data, error } = await supabase
    .from('pacientes')
    .update(pacienteParaLinha(p))
    .eq('id', p.id)
    .select('id, nome, telefone, alertas_saude');

  if (error) {
    const semPermissao = erroSemPermissao(error);
    return {
      ok: false,
      paciente: null,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil nao tem permissao para editar pacientes (apenas Recepcao).'
        : `Nao foi possivel salvar a ficha: ${error.message}`,
    };
  }
  // RLS barrando um update nao gera erro: gera zero linhas (cf. lib/consultas.ts).
  if (!data || data.length === 0) {
    return {
      ok: false,
      paciente: null,
      semPermissao: true,
      mensagem: 'Nenhuma ficha foi alterada - verifique o paciente e o seu perfil.',
    };
  }
  return { ok: true, paciente: linhaParaPaciente(data[0] as LinhaPaciente), semPermissao: false, mensagem: null };
}

/** Quantas consultas vinculadas existem (a FK e ON DELETE CASCADE: excluir apaga o historico). */
export async function contarConsultasDoPaciente(pacienteId: string): Promise<{ total: number; erro: string | null }> {
  const { count, error } = await supabase
    .from('consultas')
    .select('id', { count: 'exact', head: true })
    .eq('paciente_id', pacienteId);
  if (error) return { total: 0, erro: error.message };
  return { total: count ?? 0, erro: null };
}

export async function excluirPaciente(pacienteId: string): Promise<ResultadoEscritaPaciente> {
  const vinculo = await contarConsultasDoPaciente(pacienteId);
  if (vinculo.erro) {
    return { ok: false, paciente: null, semPermissao: false, mensagem: `Nao foi possivel verificar as consultas do paciente: ${vinculo.erro}` };
  }
  if (vinculo.total > 0) {
    return {
      ok: false,
      paciente: null,
      semPermissao: false,
      mensagem: `Nao e possivel remover este paciente pois ele possui ${vinculo.total} consulta(s) vinculada(s) no Supabase (a exclusao apagaria o historico).`,
    };
  }

  const { data, error } = await supabase.from('pacientes').delete().eq('id', pacienteId).select('id');
  if (error) {
    const semPermissao = erroSemPermissao(error);
    return {
      ok: false,
      paciente: null,
      semPermissao,
      mensagem: semPermissao
        ? 'Seu perfil nao tem permissao para excluir pacientes (apenas Recepcao).'
        : `Nao foi possivel excluir o paciente: ${error.message}`,
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      paciente: null,
      semPermissao: true,
      mensagem: 'Nenhuma ficha foi excluida - verifique se o paciente ainda existe e se o seu perfil tem permissao.',
    };
  }
  return { ok: true, paciente: null, semPermissao: false, mensagem: null };
}

/** Migracao do cache legado (`of_patients`, formato da UI) para o Supabase, uma ficha por vez. */
export async function importarPacientesLocais(
  fichas: Paciente[]
): Promise<{ importados: number; falhas: string[] }> {
  let importados = 0;
  const falhas: string[] = [];
  for (const ficha of fichas) {
    const { id: _ignorado, ...semId } = ficha;
    void _ignorado;
    const res = await criarPaciente(semId);
    if (res.ok) importados += 1;
    else falhas.push(`${ficha.name || '(sem nome)'}: ${res.mensagem ?? 'falha desconhecida'}`);
  }
  return { importados, falhas };
}
