/**
 * Nome do cookie do "modo demonstração" (T5/T7B).
 *
 * Vive em arquivo próprio, sem dependências, para poder ser importado tanto
 * pelo proxy.ts (lado servidor) quanto pelo cliente — o modo demo precisa
 * sobreviver à proteção de rotas, senão o usuário em demonstração seria
 * redirecionado para /login a cada navegação.
 *
 * Não há risco de exposição de dados: a RPC carregar_painel() continua negada
 * por RLS para anon, e o painel usa o dataset local de lib/painel-demo.ts.
 */
export const COOKIE_MODO_DEMO = 'dentalapp_modo_demo';

/** Duração do cookie de demonstração (a sessão do navegador já expira junto). */
export const COOKIE_MODO_DEMO_MAX_AGE = 8 * 60 * 60; // 8h