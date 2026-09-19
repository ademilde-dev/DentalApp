# DentalApp — Painel do Dia

App web do consultório (Next.js + Supabase) que traz para dentro do sistema a rotina
que vivia no papel/WhatsApp: **confirmação de véspera**, **recall de retorno semestral**
e **agenda do dia com alertas de saúde** — em uma única tela inicial.

> Design aprovado: `docs/designs/fabio-main-design-20260918-2150.md`

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Supabase** (PostgreSQL + Auth + RLS) via `@supabase/supabase-js`
- Tailwind CSS 4 + design system próprio em `app/globals.css`

## Rodando localmente

1. `npm install`
2. Copie `.env.example` → `.env.local` e preencha:

   | Variável | Onde obter | Uso |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Cliente Supabase (browser) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem | idem (chave pública — proteção por RLS) |
   | `GEMINI_API_KEY` *(opcional)* | Google AI Studio | Rota `/api/gemini/analyze` |

3. `npm run dev` → http://localhost:3000

## Banco de dados (Supabase)

Executar no **SQL Editor**, nesta ordem:

1. `supabase/migrations/0001_init.sql` — tabelas, trigger de retorno (1A), RLS (2A), views (4A)
2. `supabase/migrations/0002_views_rpc.sql` — RPC `carregar_painel()` (8A)
3. `supabase/migrations/0003_auth_profiles.sql` — perfil automático (`on_auth_user_created`), campos
   `nome_completo`/`ativo` e bloqueio de acesso no RLS

Verificação e operação:

- `supabase/dev/smoke-0001-0002.sql` — smoke transacional (rollback ao final)
- `supabase/dev/smoke-0003-acoes-t6.sql` — smoke das ações da agenda (T6): concluir alimenta o
  recall (1A), cancelar/reabrir anula, concluir de novo não duplica, dentista pode concluir e a
  consulta cancelada some da agenda (6A)
- `scripts/smoke-banco-anon.mjs` — smoke da parte anônima: `node --dns-result-order=ipv4first --env-file=.env.local scripts/smoke-banco-anon.mjs`
- `scripts/smoke-auth.mjs` — smoke do fluxo de entrada (splash, login, proteção de rotas): `node scripts/smoke-auth.mjs` com o servidor no ar
- `supabase/dev/criar-usuarios-perfis.sql` — criação de usuários + perfis (recepcionista/dentista)

## Fluxo de entrada e autenticação

| Rota | Papel |
|---|---|
| `/` | **Splash** — exibe a marca enquanto checa a sessão; encaminha para `/painel` (logado) ou `/login` |
| `/login` | Entrar / Criar conta (Supabase Auth, e-mail + senha) + acesso ao modo demonstração |
| `/painel` | Aplicação completa (Painel do Dia como aba inicial) — **protegida** |
| `/api/*` | Rotas internas — exigem sessão (respondem `401` em JSON para o anônimo) |

- **Autorização no servidor:** `proxy.ts` (o antigo `middleware.ts`, renomeado no Next 16) roda
  `supabase.auth.getUser()` antes de qualquer página interna, redireciona o anônimo para
  `/login?redirect=<rota>` e protege as rotas de API. Sessão é persistida em **cookie**
  (`@supabase/ssr`), não em `localStorage`.
- **Perfis (2A/0003):** todo usuário criado no Auth ganha automaticamente uma linha em
  `public.perfis` com `nome_completo` e `role` (`recepcionista` = acesso total,
  `dentista` = leitura + concluir consulta). `ativo = false` bloqueia o acesso por RLS.
- **Cadastro:** no formulário, "Criar conta" entra sempre como **Recepção** (o papel nunca vem do
  cliente); a promoção a dentista é feita pela administradora no banco. Em produção, mantenha o
  cadastro controlado em **Authentication → Providers → Email**.
- **Supabase → Authentication → URL Configuration:** cadastre as URLs do app (`Site URL` e
  `Redirect URLs`): `http://localhost:3000/**`, `https://dentalapp2026.vercel.app/**` — sem isso o
  link de confirmação de e-mail e a recuperação de senha não voltam para o app.

## Painel do Dia (decisões 4A/6A/8A + ações da T6)

As 3 listas vêm de **uma única RPC** (`carregar_painel()`, decisão 8A — 1 round-trip, sem N+1),
com o fuso `America/Sao_Paulo` calculado no banco:

| Lista | O que traz | Fonte |
|---|---|---|
| Confirmações de amanhã | consultas de amanhã não canceladas, com telefone para o wa.me | `vw_confirmacoes_amanha` |
| Reativações da semana | retornos pendentes já elegíveis (`elegivel_apos` vencido), com cooldown de 14 dias | `vw_reativacoes_semana` |
| Agenda de hoje | consultas de hoje não canceladas + alertas de saúde por linha | `vw_agenda_hoje` |

Ações da agenda (**T6**) — o que cada botão faz no banco:

- **Concluir** → o trigger `fn_gerenciar_retorno` (1A) cria/estende o retorno pendente com
  `elegivel_apos = data SP + janela_retorno_dias` (ou 180 dias). O paciente entra na lista de
  reativações sem refresh manual.
- **Cancelar** → anula o retorno pendente originado por aquela consulta (reversão 1A) e a linha
  sai da agenda (a view exclui canceladas).
- **Reabrir** (visível em consultas concluídas) → volta para `agendada` e anula o retorno daquela
  consulta.
- Permissões: `recepcionista` altera qualquer consulta; `dentista` conclui
  (`consultas_dentista_concluir`). Um update barrado pela RLS devolve **zero linhas** — a UI trata
  isso como "sem permissão" em vez de "sucesso" (`lib/consultas.ts`).
- Em **modo demonstração** as ações são apenas visuais, com aviso — nada sai para o banco.

Nota: como a agenda esconde canceladas (6A), reverter um cancelamento pela própria lista não é
possível — o dado continua no banco e a recepção pode reagendá-lo pelo cadastro de consultas.
## Deploy na Vercel

> **Projeto novo e independente.** Este repositório (`DentalApp`) é um projeto **separado** na
> Vercel — não reutilize o projeto do `odontoapp2026`. Cada projeto Vercel tem o seu próprio
> domínio, as suas próprias Environment Variables e o seu próprio histórico de deploys; assim os
> dois apps não se derrubam nem compartilham credenciais.

1. Faça push do repositório (GitHub: `ademilde-dev/DentalApp`).
2. Em [vercel.com](https://vercel.com): **Add New… → Project** → importe o repositório.
   **Não** use "Import" de um projeto existente nem reaponte o `odontoapp2026`.
   3. **Project Name:** `dentalapp2026` → o app responde em `https://dentalapp2026.vercel.app`.
   (O nome `dentalapp` está tomado na Vercel; `dentalapp2026` é o domínio oficial — nada no
   código depende de um domínio específico.)
4. Framework Preset: **Next.js** (detectado automaticamente; build `next build`, install
   `npm install`). Root Directory: a raiz do repositório.
5. **Environment Variables** (Production e Preview):

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon do projeto |
   | `GEMINI_API_KEY` *(opcional)* | habilita o assistente clínico em produção |

6. **Deploy**. Depois do primeiro deploy:
   - adicione o domínio em **Supabase → Authentication → URL Configuration**
      (`Site URL` + `Redirect URLs`: `https://dentalapp2026.vercel.app/**`);
   - confirme as variáveis em **Project → Settings → Environment Variables** e faça um
     **Redeploy** se tiver adicionado algo depois do build.

O `next.config.js` já usa `output: 'standalone'` (build enxuto, sem dependência de caminho
absoluto) e fixa `turbopack.root` na pasta do projeto — o que evita o aviso de workspace e mantém
o build determinístico na Vercel.

Notas de segurança:

- `.env.local` nunca vai ao git (o `.gitignore` cobre `.env*`).
- A `anon key` é pública por natureza — o dado de saúde é protegido por **RLS**
  (leitura/escrita exigem usuário autenticado com perfil em `perfis`).
- `GEMINI_API_KEY` é server-side (usada só na rota de API, nunca no bundle do browser).
- Rotas internas exigem sessão no servidor (`proxy.ts`); `demo` nunca acessa dados reais
  (a RLS nega tudo para `anon`).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | dev server em `localhost:3000` (Turbopack) |
| `npm run build` | build de produção (valida TypeScript) |
| `npm run start` | serve o build de produção |
| `npm run lint` | ESLint |
| `node scripts/smoke-auth.mjs` | smoke do fluxo de entrada (precisa do servidor no ar) |
| `node --dns-result-order=ipv4first --env-file=.env.local scripts/smoke-banco-anon.mjs` | smoke da RLS/objetos do banco sem sessão |
