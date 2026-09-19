import SplashScreen from '../components/splash-screen';

/**
 * Rota "/" — Splash de entrada.
 *
 * A verificação de sessão precisa do navegador (cookie de sessão do Supabase),
 * então o trabalho acontece em components/splash-screen.tsx ('use client').
 * Esta página é um Server Component fino, que só entrega a marca e deixa a
 * transição acontecer.
 */
export default function Home() {
  return <SplashScreen />;
}