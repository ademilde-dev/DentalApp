'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Info, Loader2, LogIn, Sunrise, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { definirModoDemo } from '../../lib/painel-demo';
import { carregarMeuPerfil, encerrarSessao, type ResultadoPerfil } from '../../lib/perfil';

/**
 * Formulário de acesso (cliente): abas Entrar/Criar conta, login por
 * e-mail/senha com checagem de perfil/bloqueio (2A/0003) e modo demonstração.
 * A leitura de ?redirect e ?motivo via useSearchParams exige o Suspense do
 * page.tsx e a renderização dinâmica por requisição.
 */
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SENHA_MINIMA = 8;

type Modo = 'entrar' | 'criar';
type Aviso = { tipo: 'erro' | 'info' | 'sucesso'; texto: string } | null;

function mensagemDeErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha inválidos.';
  if (/email not confirmed/i.test(msg))
    return 'E-mail ainda não confirmado — abra a mensagem que enviamos (verifique o spam) ou peça ao administrador para confirmar seu usuário.';
  if (/already registered|already been registered|user already exists/i.test(msg))
    return 'Este e-mail já possui cadastro. Use a aba "Entrar".';
  if (/signups? not allowed|signup.*disabled|not allowed for this instance/i.test(msg))
    return 'O cadastro pelo sistema está desativado. Peça à administradora do consultório para criar o seu acesso.';
  if (/password should be at least|password.*(too short|weak)|at least 8/i.test(msg))
    return `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`;
  if (/too many requests|rate limit|over_email_send_rate_limit/i.test(msg))
    return 'Muitas tentativas em sequência — aguarde um minuto e tente novamente.';
  if (/fetch failed|network|timeout|ENOTFOUND|EAI_AGAIN/i.test(msg))
    return 'Não foi possível alcançar o Supabase — verifique a conexão e tente de novo.';
  return msg;
}

export function FormularioAcesso() {
  const router = useRouter();
  const parametros = useSearchParams();

  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  const redirectParam = parametros.get('redirect');
  const destino = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/painel';
  const motivo = parametros.get('motivo');

  /** Validações locais — devolve a mensagem de erro ou null. */
  const validar = (): string | null => {
    if (!EMAIL_VALIDO.test(email.trim())) return 'Informe um e-mail válido (ex: nome@consultorio.com.br).';
    if (senha.length < SENHA_MINIMA) return `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`;
    if (modo === 'criar') {
      if (nome.trim().length < 3) return 'Informe seu nome completo (mínimo 3 letras).';
      if (senha !== confirmacao) return 'As senhas não conferem — digite a mesma senha nos dois campos.';
    }
    return null;
  };

  /** Confere o perfil (2A/0003) e decide se pode entrar no painel. */
  const validarAcesso = async (): Promise<boolean> => {
    const resultado: ResultadoPerfil = await carregarMeuPerfil();
    if (resultado.ok) return true;

    setAviso({ tipo: 'erro', texto: resultado.mensagem });
    // Sem perfil ou bloqueado: não deixa a sessão aberta — a RLS negaria tudo e
    // o usuário ficaria num painel vazio sem entender o motivo.
    if (resultado.motivo === 'sem_perfil' || resultado.motivo === 'inativo') {
      await encerrarSessao();
    }
    return false;
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setAviso(null);

    const problema = validar();
    if (problema) {
      setAviso({ tipo: 'erro', texto: problema });
      return;
    }

    setCarregando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: senha,
      });

      if (error) {
        setAviso({ tipo: 'erro', texto: mensagemDeErro(error.message) });
        return;
      }

      if (!(await validarAcesso())) return;

      definirModoDemo(false); // login real desliga o modo demonstração
      router.replace(destino);
    } catch (erro: unknown) {
      setAviso({
        tipo: 'erro',
        texto: mensagemDeErro(erro instanceof Error ? erro.message : 'Falha inesperada ao entrar.'),
      });
    } finally {
      setCarregando(false);
    }
  };

  const criarConta = async (e: React.FormEvent) => {
    e.preventDefault();
    setAviso(null);

    const problema = validar();
    if (problema) {
      setAviso({ tipo: 'erro', texto: problema });
      return;
    }

    setCarregando(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: senha,
        options: {
          // O trigger on_auth_user_created (0003) usa este metadata para gravar
          // o nome em perfis. O papel NUNCA vem do cliente: todo cadastro novo
          // entra como Recepção e é promovido pela administradora no banco.
          data: { nome_completo: nome.trim() },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setAviso({ tipo: 'erro', texto: mensagemDeErro(error.message) });
        return;
      }

      // Sem sessão devolvida = confirmação de e-mail pendente.
      if (!data.session) {
        setAviso({
          tipo: 'sucesso',
          texto: `Conta criada! Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail para ativar o acesso.`,
        });
        setSenha('');
        setConfirmacao('');
        return;
      }

      if (!(await validarAcesso())) return;

      definirModoDemo(false);
      router.replace(destino);
    } catch (erro: unknown) {
      setAviso({
        tipo: 'erro',
        texto: mensagemDeErro(erro instanceof Error ? erro.message : 'Falha inesperada ao criar a conta.'),
      });
    } finally {
      setCarregando(false);
    }
  };

  const trocarModo = (novo: Modo) => {
    setModo(novo);
    setAviso(null);
    setSenha('');
    setConfirmacao('');
  };

  const entrarEmModoDemo = () => {
    definirModoDemo(true);
    router.replace('/painel');
  };

  const configuracaoAusente = motivo === 'sem_configuracao';

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '2.25rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <img
            src="/logo_cartao.jpg"
            alt="Consultório Odontológico Dra. Fabíola Dulce Monteiro"
            style={{ width: '92px', height: '92px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.9rem', display: 'block', border: '2px solid var(--border-color)' }}
            referrerPolicy="no-referrer"
          />
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'var(--font-sans)' }}>Consultório Odontológico</h1>
          <p className="text-muted" style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>Dra. Fabíola Dulce Monteiro</p>
        </div>

        <div className="auth-abas" role="tablist" aria-label="Entrar ou criar conta">
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'entrar'}
            className={`auth-aba ${modo === 'entrar' ? 'ativa' : ''}`}
            onClick={() => trocarModo('entrar')}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'criar'}
            className={`auth-aba ${modo === 'criar' ? 'ativa' : ''}`}
            onClick={() => trocarModo('criar')}
          >
            Criar conta
          </button>
        </div>


        {configuracaoAusente && (
          <div className="aviso-caixa aviso-erro">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            <span>
              Supabase não configurado neste ambiente. Preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (no <code>.env.local</code> local ou nas Environment
              Variables da Vercel) e recarregue a página.
            </span>
          </div>
        )}

        {modo === 'criar' && !configuracaoAusente && (
          <div className="aviso-caixa aviso-info">
            <Info size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            <span>
              Novos acessos entram como <strong>Recepção</strong>; se você é dentista, a administradora promove o seu
              perfil no banco.
            </span>
          </div>
        )}

        {aviso && (
          <div className={`aviso-caixa aviso-${aviso.tipo}`} role="alert">
            {aviso.tipo === 'sucesso' ? (
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            ) : (
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            )}
            <span>{aviso.texto}</span>
          </div>
        )}

        <form onSubmit={modo === 'entrar' ? entrar : criarConta} noValidate>
          {modo === 'criar' && (
            <div className="form-group">
              <label htmlFor="auth-nome">Nome completo</label>
              <input
                id="auth-nome"
                type="text"
                className="form-control"
                autoComplete="name"
                placeholder="Ex: Maria Souza"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                disabled={carregando}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">E-mail</label>
            <input
              id="auth-email"
              type="email"
              className="form-control"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-senha">Senha</label>
            <input
              id="auth-senha"
              type="password"
              className="form-control"
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              placeholder={`mínimo ${SENHA_MINIMA} caracteres`}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              disabled={carregando}
            />
          </div>

          {modo === 'criar' && (
            <div className="form-group">
              <label htmlFor="auth-senha2">Confirmar senha</label>
              <input
                id="auth-senha2"
                type="password"
                className="form-control"
                autoComplete="new-password"
                placeholder="repita a senha"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                disabled={carregando}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={carregando || configuracaoAusente}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.25rem' }}
          >
            {carregando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : modo === 'entrar' ? (
              <LogIn size={16} />
            ) : (
              <UserPlus size={16} />
            )}
            {carregando
              ? modo === 'entrar'
                ? 'Entrando...'
                : 'Criando conta...'
              : modo === 'entrar'
                ? 'Entrar'
                : 'Criar minha conta'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={entrarEmModoDemo}
          disabled={carregando}
          style={{ width: '100%', marginTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <Sunrise size={15} /> Explorar em modo demonstração
        </button>

        <p className="text-muted" style={{ textAlign: 'center', fontSize: '0.78rem', margin: '1.25rem 0 0' }}>
          Acesso restrito à equipe · dados de saúde protegidos por RLS
        </p>
      </div>
    </main>
  );
}

