'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

/**
 * Splash screen de entrada (app/page.tsx → rota "/").
 *
 * Requisito do design: exibir a identidade visual do consultório enquanto o
 * estado de autenticação é verificado em segundo plano, e então:
 *   - sessão ativa  → Painel do Dia (/painel)
 *   - sem sessão    → Login (/login)
 *
 * Verificamos com getSession() (leitura local do cookie, sem round-trip) para
 * a transição ser instantânea; a autorização de verdade acontece no proxy.ts
 * com getUser(), que valida o JWT no servidor antes de liberar /painel.
 *
 * Atraso mínimo: só para quem NÃO tem sessão (1,2s), garantindo que a marca
 * seja vista em vez de um flash branco. Quem já está logado passa direto.
 */

const ATRASO_MINIMO_MS = 1200;

/**
 * `somenteVisual`: renderiza a marca + spinner sem decidir destino. Usado pelo
 * portão de sessão do /painel, para que a transição splash → painel não pisque
 * num texto solto enquanto o cliente hidrata (e para o /painel com sessão nunca
 * aparecer "em branco" no primeiro paint).
 */
export default function SplashScreen({
  somenteVisual = false,
  mensagemInicial = 'Verificando sessão...',
}: {
  somenteVisual?: boolean;
  mensagemInicial?: string;
}) {
  const router = useRouter();
  const [mensagem, setMensagem] = useState(mensagemInicial);

  useEffect(() => {
    if (somenteVisual) return;
    let cancelado = false;

    const decidirDestino = async () => {
      const inicio = Date.now();
      let destino = '/login';

      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) destino = '/painel';
      } catch {
        // Credenciais ausentes/rede fora: segue para o login, que explica o estado.
        destino = '/login';
      }

      if (cancelado) return;
      setMensagem(destino === '/painel' ? 'Abrindo o painel...' : 'Ir para o acesso da equipe...');

      const restante = destino === '/painel' ? 0 : ATRASO_MINIMO_MS - (Date.now() - inicio);
      if (restante > 0) await new Promise((r) => setTimeout(r, restante));
      if (cancelado) return;

      router.replace(destino);
    };

    decidirDestino();
    return () => {
      cancelado = true;
    };
  }, [router, somenteVisual]);

  return (
    <main className="splash-screen" aria-busy="true" aria-live="polite">
      <div className="splash-conteudo">
        <div className="splash-logo">
          <img
            src="/logo_cartao.jpg"
            alt="Consultório Odontológico Dra. Fabíola Dulce Monteiro"
            referrerPolicy="no-referrer"
          />
        </div>

        <h1 className="splash-titulo">Consultório Odontológico</h1>
        <p className="splash-subtitulo">Dra. Fabíola Dulce Monteiro</p>

        <div className="splash-carregando">
          <span className="splash-spinner" aria-hidden="true" />
          <span className="splash-mensagem">{mensagem}</span>
        </div>
      </div>

      <footer className="splash-rodape">
        <p>Sistema de gestão clínica · dados protegidos</p>
      </footer>
    </main>
  );
}