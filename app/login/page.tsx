import React, { Suspense } from 'react';
import { FormularioAcesso } from './formulario-acesso';

/**
 * Tela de acesso (/login) — Fluxo de entrada.
 *
 * Pagina de servidor que forca renderizacao dinamica por requisicao: o
 * formulario le ?redirect e ?motivo via useSearchParams, e sem isso o Next
 * pre-renderiza a rota como estatica servindo so o fallback vazio do Suspense
 * (o formulario apareceria apenas apos a hidratacao no cliente).
 */
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  // useSearchParams exige um limite de Suspense no App Router.
  return (
    <Suspense fallback={null}>
      <FormularioAcesso />
    </Suspense>
  );
}
