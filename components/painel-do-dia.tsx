'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarCheck,
  CalendarX,
  CheckCircle,
  Droplet,
  Heart,
  MessageCircle,
  Phone,
  Pill,
  RefreshCw,
  RotateCcw,
  Sunrise,
  X,
} from 'lucide-react';
import {
  carregarPainel,
  marcarContatado,
  type AlertasSaude,
  type ErroPainel,
  type Painel,
} from '../lib/painel';
import { carregarPainelDemo } from '../lib/painel-demo';
import { montarLembrete } from '../lib/mensagem';
import {
  EFEITO_NO_RETORNO,
  ROTULO_STATUS_CONSULTA,
  marcarStatusConsulta,
  type StatusConsulta,
} from '../lib/consultas';

type ModoDados = 'carregando' | 'supabase' | 'demo' | 'erro';

const dataHoje = (): string => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
};

/** Dias desde uma data 'YYYY-MM-DD' (para o badge "vencido há X dias"). */
const diasAtras = (dataISO: string): number =>
  Math.floor(
    (new Date(`${dataHoje()}T00:00:00`).getTime() - new Date(`${dataISO}T00:00:00`).getTime()) / 86400000
  );

/**
 * Transições de status oferecidas na agenda (T6).
 * "Concluir" enquanto o atendimento ainda não foi concluído; "Cancelar" sempre
 * que não estiver cancelada — cancelar uma consulta já concluída é justamente a
 * reversão que anula o retorno pendente (decisão 1A / test plan).
 */
const podeConcluir = (status: string): boolean => status === 'agendada' || status === 'confirmada' || status === 'faltou';
const podeCancelar = (status: string): boolean => status !== 'cancelada';

/** Alertas de saúde visíveis por linha — o motivo de existir da 3ª lista. */
const BadgeAlertas = ({ alertas }: { alertas: AlertasSaude | null }) => {
  if (!alertas) return null;
  const tags: React.ReactNode[] = [];
  const estiloTag = { fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' };
  if (alertas.alergias) {
    tags.push(
      <span key="al" className="badge badge-red" style={estiloTag}>
        <AlertTriangle size={11} /> {String(alertas.alergias)}
      </span>
    );
  }
  if (alertas.hipertensao) {
    tags.push(
      <span key="hp" className="badge badge-orange" style={estiloTag}>
        <Heart size={11} /> Pressão alta
      </span>
    );
  }
  if (alertas.diabetes) {
    tags.push(
      <span key="db" className="badge badge-blue" style={estiloTag}>
        <Droplet size={11} /> Diabetes
      </span>
    );
  }
  if (alertas.medicacoes) {
    tags.push(
      <span key="md" className="badge badge-green" style={estiloTag}>
        <Pill size={11} /> {String(alertas.medicacoes)}
      </span>
    );
  }
  if (tags.length === 0) return null;
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>{tags}</div>;
};

const Secao = ({
  icone,
  titulo,
  contagem,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  contagem: number;
  children: React.ReactNode;
}) => (
  <div className="card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
      {icone}
      <h2 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-sans)' }}>{titulo}</h2>
      <span className="badge badge-blue" style={{ marginLeft: 'auto' }}>{contagem}</span>
    </div>
    {children}
  </div>
);

const LinhaVazia = () => (
  <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.9rem 0' }}>
    <CheckCircle size={16} /> Nada pendente ✓
  </div>
);

export default function PainelDoDia({ irParaPacientes }: { irParaPacientes: () => void }) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [modo, setModo] = useState<ModoDados>('carregando');
  const [erro, setErro] = useState<ErroPainel | null>(null);
  const [marcando, setMarcando] = useState<Record<string, boolean>>({});
  /** T6 — consultas com alteração de status em andamento (desabilita os botões). */
  const [alterando, setAlterando] = useState<Record<string, boolean>>({});
  /** T6 — retorno da última ação de status (o usuário precisa saber o efeito no recall). */
  const [avisoAcao, setAvisoAcao] = useState<{ tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null>(null);

  const aplicarResultado = useCallback((dados: Painel | null, falha: ErroPainel | null) => {
    if (dados) {
      setPainel(dados);
      setModo('supabase');
      return;
    }
    // Pré-T4 (sem sessão): cai em modo demonstração para o ciclo de validação
    // visual (7B) — sempre com o banner "Modo demonstração" visível.
    if (falha && falha.tipo === 'sem_sessao') {
      setPainel(carregarPainelDemo());
      setModo('demo');
      return;
    }
    setErro(falha);
    setModo('erro');
  }, []);

  /** Atualizar / tentar novamente (com estado de carregamento visível). */
  const carregar = useCallback(async () => {
    setModo('carregando');
    setErro(null);
    const { painel: dados, erro: falha } = await carregarPainel();
    aplicarResultado(dados, falha);
  }, [aplicarResultado]);

  // Carga inicial: await antes de qualquer setState
  // (regra react-hooks/set-state-in-effect + flag de cleanup p/ unmount)
  useEffect(() => {
    let ativo = true;
    void (async () => {
      const { painel: dados, erro: falha } = await carregarPainel();
      if (ativo) aplicarResultado(dados, falha);
    })();
    return () => { ativo = false; };
  }, [aplicarResultado]);

  const usarDemo = () => {
    setPainel(carregarPainelDemo());
    setModo('demo');
    setErro(null);
  };

  /** Clique no wa.me de reativação: abre o WhatsApp (href) e marca 'contatado'. */
  const aoClicarWhatsApp = async (retornoId: string) => {
    setMarcando(m => ({ ...m, [retornoId]: true }));
    const aplicar = (retorno_status: 'pendente' | 'contatado') =>
      setPainel(p =>
        p
          ? {
              ...p,
              reativacoes_semana: p.reativacoes_semana.map(r =>
                r.retorno_id === retornoId
                  ? { ...r, retorno_status, atualizado_em: new Date().toISOString() }
                  : r
              ),
            }
          : p
      );
    aplicar('contatado');
    const { erro: falhaUpdate } = await marcarContatado(retornoId);
    if (falhaUpdate) {
      // ex.: dentista não pode atualizar retornos (RLS 2A) → reverte visualmente
      console.warn('[painel] não foi possível marcar como contatado:', falhaUpdate);
      aplicar('pendente');
    }
    setMarcando(m => ({ ...m, [retornoId]: false }));
  };

  /**
   * T6 — altera o status da consulta e recarrega o painel.
   *
   * Por que recarregar em vez de atualizar só a linha: concluir dispara o
   * trigger fn_gerenciar_retorno (1A), que cria/estende o retorno pendente, e
   * cancelar/reabrir anula o pendente daquela consulta. O efeito aparece na
   * lista de reativações — só o banco sabe calculá-lo (elegivel_apos = data SP
   * + janela do procedimento). Recarregar mantém as 3 listas coerentes.
   */
  const alterarStatus = async (consultaId: string, status: StatusConsulta) => {
    setAlterando(a => ({ ...a, [consultaId]: true }));
    setAvisoAcao(null);

    // Modo demonstração: nada sai daqui para o banco (a RLS nega anon). A
    // alteração é só visual, com o aviso explicando o que aconteceria de fato.
    if (modo === 'demo') {
      setPainel(p =>
        p
          ? { ...p, agenda_hoje: p.agenda_hoje.map(c => (c.consulta_id === consultaId ? { ...c, status } : c)) }
          : p
      );
      setAvisoAcao({
        tipo: 'info',
        texto: `Demonstração: consulta marcada como "${ROTULO_STATUS_CONSULTA[status]}". No banco real isso alimenta o recall automático.`,
      });
      setAlterando(a => ({ ...a, [consultaId]: false }));
      return;
    }

    const resultado = await marcarStatusConsulta(consultaId, status);
    if (!resultado.ok) {
      setAvisoAcao({ tipo: 'erro', texto: resultado.mensagem || 'Não foi possível atualizar a consulta.' });
      setAlterando(a => ({ ...a, [consultaId]: false }));
      return;
    }

    const { painel: dados, erro: falha } = await carregarPainel();
    if (dados) {
      aplicarResultado(dados, null);
    } else if (falha) {
      // O status mudou no banco, mas a releitura falhou: avisa sem derrubar o
      // painel (o "Atualizar" refaz a carga).
      setAvisoAcao({
        tipo: 'info',
        texto: `Consulta atualizada, mas não foi possível recarregar o painel: ${falha.mensagem}`,
      });
      setAlterando(a => ({ ...a, [consultaId]: false }));
      return;
    }

    setAvisoAcao({
      tipo: 'sucesso',
      texto:
        status === 'concluida'
          ? 'Consulta concluída — o retorno entrou na lista de reativações.'
          : status === 'cancelada'
            ? 'Consulta cancelada — o retorno pendente dela foi anulado.'
            : 'Consulta reaberta.',
    });
    setAlterando(a => ({ ...a, [consultaId]: false }));
  };

  if (modo === 'carregando') {
    return (
      <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
        <Sunrise size={40} style={{ color: 'var(--color-primary)', marginBottom: '0.75rem' }} />
        <p className="text-muted">Carregando o Painel do Dia...</p>
      </div>
    );
  }

  if (modo === 'erro' && erro) {
    return (
      <div className="card" style={{ padding: '2.5rem 2rem', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
        <AlertTriangle size={40} style={{ color: '#f59e0b', marginBottom: '0.75rem' }} />
        <h3 style={{ margin: '0 0 0.5rem', fontFamily: 'var(--font-sans)' }}>Não foi possível carregar o painel</h3>
        <p className="text-muted" style={{ marginBottom: '1.25rem' }}>{erro.mensagem}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => void carregar()}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
          <button className="btn btn-secondary" onClick={usarDemo}>
            Ver em modo demonstração
          </button>
        </div>
      </div>
    );
  }

  if (!painel) return null;

  const badgeStatusAgenda: Record<string, { classe: string; texto: string }> = {
    agendada: { classe: 'badge-blue', texto: 'Agendada' },
    confirmada: { classe: 'badge-green', texto: 'Confirmada' },
    concluida: { classe: 'badge-green', texto: 'Concluída' },
    faltou: { classe: 'badge-red', texto: 'Faltou' },
  };

  return (
    <div>
      {/* Barra de status do painel */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {modo === 'demo' && (
            <span className="badge badge-orange">
              Modo demonstração — dados de exemplo (login Supabase Auth / T4 pendente)
            </span>
          )}
          {modo === 'supabase' && <span className="badge badge-green">Dados ao vivo — Supabase</span>}
          {painel.gerado_em_sp && (
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
              Atualizado ({modo === 'demo' ? 'exemplo' : 'banco'}): {painel.gerado_em_sp}
            </span>
          )}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => void carregar()}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Feedback da última ação de status (T6): o usuário precisa saber que o
          retorno foi criado/anulado — é o ponto do fluxo, não um detalhe. */}
      {avisoAcao && (
        <div className={`aviso-caixa aviso-${avisoAcao.tipo}`} style={{ marginBottom: '1rem' }} role="status">
          {avisoAcao.tipo === 'erro' ? (
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          ) : (
            <CheckCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          )}
          <span>{avisoAcao.texto}</span>
          <button
            type="button"
            onClick={() => setAvisoAcao(null)}
            title="Fechar aviso"
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 1. CONFIRMAÇÕES DE AMANHÃ (véspera — wa.me 1 clique) */}
      <Secao icone={<CalendarCheck size={18} style={{ color: '#3b82f6' }} />} titulo="Confirmações de amanhã" contagem={painel.confirmacoes_amanha.length}>
        {painel.confirmacoes_amanha.length === 0 ? (
          <LinhaVazia />
        ) : (
          painel.confirmacoes_amanha.map(c => {
            const link = montarLembrete({
              paciente: c.paciente_nome,
              procedimento: c.procedimento_nome || 'consulta',
              data: c.data_sp ? formatarDataBR(c.data_sp) : '',
              tipo: 'confirmacao',
              hora: c.hora_sp || undefined,
              telefone: c.telefone,
            });
            return (
              <div key={c.consulta_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.85rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <strong>{c.hora_sp}</strong>
                    <strong>{c.paciente_nome}</strong>
                    {c.procedimento_nome && <span className="badge badge-blue">{c.procedimento_nome}</span>}
                    {c.status === 'confirmada' && <span className="badge badge-green">Confirmada</span>}
                  </div>
                  {c.dentista_nome && <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>com {c.dentista_nome}</div>}
                  <BadgeAlertas alertas={c.alertas_saude} />
                </div>
                {c.tem_telefone && link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                    <MessageCircle size={14} /> Confirmar via WhatsApp
                  </a>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={irParaPacientes} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                    <Phone size={14} /> Cadastrar telefone
                  </button>
                )}
              </div>
            );
          })
        )}
      </Secao>

      {/* 2. PACIENTES PARA REATIVAR ESTA SEMANA (recall ≥180 dias sem retorno) */}
      <Secao icone={<CalendarClock size={18} style={{ color: '#f59e0b' }} />} titulo="Pacientes para reativar esta semana" contagem={painel.reativacoes_semana.length}>
        {painel.reativacoes_semana.length === 0 ? (
          <LinhaVazia />
        ) : (
          painel.reativacoes_semana.map(r => {
            const link = montarLembrete({
              paciente: r.paciente_nome,
              procedimento: r.procedimento_nome || 'consulta',
              data: r.consulta_origem_data_sp || '',
              tipo: 'reativacao',
              telefone: r.telefone,
            });
            const vencidoHa = diasAtras(r.elegivel_apos);
            const emContato = r.retorno_status === 'contatado';
            return (
              <div key={r.retorno_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.85rem 0', borderBottom: '1px solid var(--border-color)', opacity: emContato && !r.recontatar ? 0.55 : 1 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <strong>{r.paciente_nome}</strong>
                    {r.procedimento_nome && <span className="badge badge-blue">{r.procedimento_nome}</span>}
                    {!emContato && (vencidoHa > 0
                      ? <span className="badge badge-red">Vencido há {vencidoHa} {vencidoHa === 1 ? 'dia' : 'dias'}</span>
                      : <span className="badge badge-orange">Esta semana</span>)}
                    {emContato && r.recontatar && <span className="badge badge-orange">Recontatar</span>}
                    {emContato && !r.recontatar && <span className="badge badge-green">Contatado</span>}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    Última consulta: {r.consulta_origem_data_sp || '-'} · retorno elegível desde {r.elegivel_apos ? formatarDataBR(r.elegivel_apos) : '-'}
                  </div>
                  <BadgeAlertas alertas={r.alertas_saude} />
                </div>
                {r.tem_telefone && link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm"
                    onClick={() => void aoClicarWhatsApp(r.retorno_id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap', opacity: marcando[r.retorno_id] ? 0.6 : 1 }}
                  >
                    <MessageCircle size={14} /> {emContato ? 'Recontatar via WhatsApp' : 'Enviar mensagem'}
                  </a>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={irParaPacientes} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                    <Phone size={14} /> Cadastrar telefone
                  </button>
                )}
              </div>
            );
          })
        )}
      </Secao>

      {/* 3. AGENDA DE HOJE (alertas de saúde visíveis por linha) */}
      <Secao icone={<CalendarClock size={18} style={{ color: '#10b981' }} />} titulo="Agenda de hoje" contagem={painel.agenda_hoje.length}>
        {painel.agenda_hoje.length === 0 ? (
          <LinhaVazia />
        ) : (
          painel.agenda_hoje.map(a => {
            const status = badgeStatusAgenda[a.status] || { classe: 'badge-blue', texto: a.status };
            return (
              <div key={a.consulta_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.85rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <strong>{a.hora_sp}</strong>
                    <strong>{a.paciente_nome}</strong>
                    {a.procedimento_nome && <span className="badge badge-blue">{a.procedimento_nome}</span>}
                    <span className={`badge ${status.classe}`}>{status.texto}</span>
                  </div>
                  {a.dentista_nome && <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>com {a.dentista_nome}</div>}
                  <BadgeAlertas alertas={a.alertas_saude} />
                </div>

                {/* Ações de status (T6) — alimentam o trigger do recall (1A).
                    Concluir gera o retorno; cancelar anula o pendente. */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {podeConcluir(a.status) && (
                    <button
                      className="btn btn-primary btn-sm"
                      title={EFEITO_NO_RETORNO.concluida}
                      disabled={Boolean(alterando[a.consulta_id])}
                      onClick={() => void alterarStatus(a.consulta_id, 'concluida')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap', opacity: alterando[a.consulta_id] ? 0.6 : 1 }}
                    >
                      <CheckCircle size={14} /> Concluir
                    </button>
                  )}
                  {podeCancelar(a.status) && (
                    <button
                      className="btn btn-secondary btn-sm"
                      title={EFEITO_NO_RETORNO.cancelada}
                      disabled={Boolean(alterando[a.consulta_id])}
                      onClick={() => void alterarStatus(a.consulta_id, 'cancelada')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap', opacity: alterando[a.consulta_id] ? 0.6 : 1 }}
                    >
                      <CalendarX size={14} /> Cancelar
                    </button>
                  )}
                  {a.status === 'concluida' && (
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Reabre a consulta: anula o retorno pendente gerado por ela"
                      disabled={Boolean(alterando[a.consulta_id])}
                      onClick={() => void alterarStatus(a.consulta_id, 'agendada')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap', opacity: alterando[a.consulta_id] ? 0.6 : 1 }}
                    >
                      <RotateCcw size={14} /> Reabrir
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Secao>
    </div>
  );
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (datas vindas do banco / demo). */
function formatarDataBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}
