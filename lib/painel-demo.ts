/**
 * Modo demonstração do Painel do Dia (T5).
 *
 * Enquanto o login Supabase Auth (T4) não existe, a RPC carregar_painel() nega
 * por RLS/execute. Para o ciclo de validação visual (decisão 7B) o painel cai
 * neste dataset de exemplo — com TODOS os edge cases 6A representados:
 *   - confirmação SEM telefone (botão "cadastrar telefone", wa.me oculto)
 *   - confirmação com telefone (wa.me 1 clique)
 *   - reativação pendente vencida (badge "vencido")
 *   - reativação contatada há 14+ dias (badge "recontatar")
 *   - agenda de hoje com alertas de saúde visíveis por linha
 *
 * O shape é idêntico ao retorno da RPC — o componente é agnóstico à fonte.
 */
import type { Painel } from './painel';
import { COOKIE_MODO_DEMO, COOKIE_MODO_DEMO_MAX_AGE } from './modo-demo-cookie';

const getLocalDateString = (date: Date = new Date()): string => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split('T')[0];
};

const addDias = (dias: number): string => getLocalDateString(new Date(Date.now() + dias * 86400000));

const formatarBR = (dataISO: string): string => {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
};

const isoEm = (dataISO: string, hora: string): string =>
  new Date(`${dataISO}T${hora}:00`).toISOString();

export function carregarPainelDemo(): Painel {
  const hoje = addDias(0);
  const amanha = addDias(1);

  return {
    gerado_em_sp: new Date().toTimeString().slice(0, 5),
    confirmacoes_amanha: [
      {
        consulta_id: 'demo-c1',
        data: isoEm(amanha, '08:00'),
        data_sp: amanha,
        hora_sp: '08:00',
        status: 'agendada',
        dentista_nome: 'Dra. Fabíola Monteiro',
        procedimento_nome: 'Avaliação Inicial',
        paciente_id: 'demo-p1',
        paciente_nome: 'Bruno Costa',
        telefone: null,
        tem_telefone: false, // 6A: sem telefone → botão "cadastrar telefone"
        alertas_saude: {},
      },
      {
        consulta_id: 'demo-c2',
        data: isoEm(amanha, '13:30'),
        data_sp: amanha,
        hora_sp: '13:30',
        status: 'confirmada',
        dentista_nome: 'Dr. Carlos Silva',
        procedimento_nome: 'Limpeza Profilaxia',
        paciente_id: 'demo-p4',
        paciente_nome: 'Elisa Prado',
        telefone: '(11) 97788-2468',
        tem_telefone: true,
        alertas_saude: { observacoes: 'Prefere horários à tarde.' },
      },
    ],
    reativacoes_semana: [
      {
        retorno_id: 'demo-r1',
        paciente_id: 'demo-p2',
        paciente_nome: 'Ana Ribeiro',
        telefone: '(11) 98877-1234',
        tem_telefone: true,
        alertas_saude: { alergias: 'Penicilina', hipertensao: true, diabetes: false },
        elegivel_apos: addDias(-20),
        retorno_status: 'pendente',
        atualizado_em: isoEm(addDias(-200), '10:00'),
        consulta_origem_id: 'demo-c0',
        consulta_origem_data: isoEm(addDias(-200), '10:00'),
        consulta_origem_data_sp: formatarBR(addDias(-200)),
        procedimento_nome: 'Limpeza Profilaxia',
        recontatar: false,
      },
      {
        retorno_id: 'demo-r2',
        paciente_id: 'demo-p3',
        paciente_nome: 'Diego Alves',
        telefone: '(21) 99123-4567',
        tem_telefone: true,
        alertas_saude: { diabetes: true },
        elegivel_apos: addDias(-35),
        retorno_status: 'contatado',
        atualizado_em: isoEm(addDias(-20), '09:00'),
        consulta_origem_id: 'demo-c5',
        consulta_origem_data: isoEm(addDias(-215), '14:00'),
        consulta_origem_data_sp: formatarBR(addDias(-215)),
        procedimento_nome: 'Restauração',
        recontatar: true, // 6A: contatado há 14+ dias → badge "recontatar"
      },
    ],
    agenda_hoje: [
      {
        consulta_id: 'demo-c3',
        data: isoEm(hoje, '09:30'),
        data_sp: hoje,
        hora_sp: '09:30',
        status: 'agendada',
        dentista_id: 'demo-d1',
        dentista_nome: 'Dra. Fabíola Monteiro',
        procedimento_nome: 'Restauração',
        paciente_id: 'demo-p5',
        paciente_nome: 'Carla Dias',
        telefone: '(11) 96666-7788',
        tem_telefone: true,
        alertas_saude: { diabetes: true, medicacoes: 'Metformina 850mg' },
      },
      {
        consulta_id: 'demo-c4',
        data: isoEm(hoje, '15:00'),
        data_sp: hoje,
        hora_sp: '15:00',
        status: 'confirmada',
        dentista_id: 'demo-d1',
        dentista_nome: 'Dra. Fabíola Monteiro',
        procedimento_nome: 'Canal Endodontia',
        paciente_id: 'demo-p2',
        paciente_nome: 'Ana Ribeiro',
        telefone: '(11) 98877-1234',
        tem_telefone: true,
        alertas_saude: { alergias: 'Penicilina', hipertensao: true, medicacoes: 'Losartana 50mg' },
      },
      {
        // Já concluída: vw_agenda_hoje não exclui concluídas (só canceladas), e é
        // esta linha que mostra o botão "Reabrir" — a reversão da decisão 1A.
        consulta_id: 'demo-c5',
        data: isoEm(hoje, '11:00'),
        data_sp: hoje,
        hora_sp: '11:00',
        status: 'concluida',
        dentista_id: 'demo-d1',
        dentista_nome: 'Dra. Fabíola Monteiro',
        procedimento_nome: 'Limpeza e Profilaxia',
        paciente_id: 'demo-p4',
        paciente_nome: 'Diego Martins',
        telefone: '(11) 95555-3322',
        tem_telefone: true,
        alertas_saude: null,
      },
    ],
  };
}

const CHAVE_MODO_DEMO = 'dentalapp:modo-demo';

/**
 * O usuário entrou no modo demonstração nesta sessão?
 * Lê o sessionStorage (UI) OU o cookie (para quem volta já autenticado pela
 * demonstração, cujo sessionStorage pode ter sido limpo numa nova aba).
 */
export function modoDemoAtivo(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (window.sessionStorage.getItem(CHAVE_MODO_DEMO) === '1') return true;
    return document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE_MODO_DEMO}=1`));
  } catch {
    return false; // storage bloqueado
  }
}

/**
 * Liga/desliga o modo demonstração.
 *
 * Grava em dois lugares de propósito:
 *   - sessionStorage → estado imediato da UI (sobrevive a refresh da aba);
 *   - cookie (não-httpOnly) → o proxy.ts consegue enxergá-lo e não redireciona
 *     a navegação para /login; o logout apaga o cookie e volta à splash.
 * Vale apenas para a sessão atual do navegador.
 */
export function definirModoDemo(ativo: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    if (ativo) {
      window.sessionStorage.setItem(CHAVE_MODO_DEMO, '1');
      document.cookie = `${COOKIE_MODO_DEMO}=1; path=/; max-age=${COOKIE_MODO_DEMO_MAX_AGE}; samesite=lax`;
    } else {
      window.sessionStorage.removeItem(CHAVE_MODO_DEMO);
      document.cookie = `${COOKIE_MODO_DEMO}=; path=/; max-age=0; samesite=lax`;
    }
  } catch {
    // storage bloqueado — sem efeito
  }
}
