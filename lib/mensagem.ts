/**
 * Template wa.me centralizado — decisão 5A do design
 * (docs/designs/fabio-main-design-20260918-2150.md).
 *
 * Módulo PURO: sem rede, sem React. A sanitização de telefone acontece aqui —
 * em um só lugar — e a revisão de mensagem/LGPD (Open Question 4) lê este
 * arquivo inteiro.
 */

export type TipoLembrete = 'confirmacao' | 'reativacao';

export interface ParamsLembrete {
  /** Nome do paciente ( vai no texto da mensagem ) */
  paciente: string;
  /** Nome do procedimento da consulta/último atendimento */
  procedimento: string;
  /** Data pronta para exibição (ex.: '20/09/2026') */
  data: string;
  /** 'confirmacao' = véspera | 'reativacao' = recall de retorno */
  tipo: TipoLembrete;
  /** Telefone como está no cadastro (com máscara ou não) */
  telefone?: string | null;
  /** 'HH:MM' — usado apenas na confirmação de véspera */
  hora?: string;
}

const CLINICA = 'Consultório Dra. Fabíola Monteiro';

/** Texto da mensagem — ponto único de revisão (LGPD/consentimento, OQ4). */
export function montarTextoLembrete({
  paciente,
  procedimento,
  data,
  tipo,
  hora,
}: Omit<ParamsLembrete, 'telefone'>): string {
  if (tipo === 'confirmacao') {
    return (
      `Olá, ${paciente}! Passando para confirmar sua consulta de ${procedimento} ` +
      `amanhã, ${data} às ${hora || '--:--'}. Pode confirmar sua presença?`
    );
  }
  return (
    `Olá, ${paciente}! Tudo bem? Sua última consulta de ${procedimento} foi em ${data} ` +
    `e o ${CLINICA} gostaria de agendar seu retorno. Quando fica bom para você?`
  );
}

/**
 * Sanitização do telefone (test plan: "só dígitos, código país").
 * Aceita máscara, +55, 0XX; devolve '' quando o formato não permite wa.me
 * (edge case 6A → a UI mostra "cadastrar telefone" e oculta o WhatsApp).
 */
export function sanitizarTelefone(telefone: string | null | undefined): string {
  if (!telefone) return '';
  let digitos = String(telefone).replace(/\D+/g, '');
  if (!digitos) return '';
  digitos = digitos.replace(/^0+/, ''); // prefixo de operadora (0XX)
  if (digitos.startsWith('55') && digitos.length >= 12 && digitos.length <= 13) {
    return digitos; // já tem código do país
  }
  if (digitos.length >= 10 && digitos.length <= 11) {
    return `55${digitos}`; // DDD + número (fixo 10 / celular 11)
  }
  return ''; // incompleto/estranho → wa.me oculto
}

/**
 * Link wa.me pronto (1 clique) ou null quando o telefone não permite.
 */
export function montarLembrete(params: ParamsLembrete): string | null {
  const numero = sanitizarTelefone(params.telefone);
  if (!numero) return null;
  const texto = montarTextoLembrete(params);
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
