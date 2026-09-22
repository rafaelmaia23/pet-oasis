# pet-oasis — web: guia para o Claude Code

Este arquivo guarda **só o que é específico do web**: stack, arquitetura (BFF, server-first),
superfícies, tratamento de erro, testes, design system e comandos. Tudo que vale para o
monorepo inteiro — a regra de nunca decidir regra de negócio nem de produto, TDD, o fluxo de
branches por fase, a convenção de commits (escopo `web`, e a proibição de trailer de agente),
como ler o contexto, onde mora cada documento, o pipeline das skills — está no **`CLAUDE.md`
da raiz**, e vale aqui integralmente.

O web consome a API REST de `apps/api`, que é a **autoridade de todo o domínio**: aqui não há
banco, não há regra de negócio e não há validação que decide.

## ⚠️ REGRA — A API é a autoridade

Nenhuma regra de negócio é reimplementada aqui. Em particular:

- **`can()` só esconde afordância, nunca protege recurso.** Um `can()` esquecido resulta em
  403 — feio, não inseguro. E ele **tem** que honrar o wildcard `*`, senão o admin não vê
  nada.
- **Zod valida formulário, nunca resposta** (ADR-0003). A validação que decide é a da API.
- **Os schemas vêm de `@pet-oasis/api-contracts`** (`packages/api-contracts`), nunca de cópia
  (ADR-0003): request, views de resposta, enums, `ERROR_CODES` e a tabela de rotas que tipa o
  `apiFetch`.
- **Não decodifique o JWT para decidir nada.** O conteúdo dele é da API; a validade do
  access token vem da resposta de login/refresh, tipada pelo contrato.
- Dúvida sobre comportamento da API se resolve **lendo o guia de integração dela**, nunca
  inferindo: `apps/api/docs/guides/integrating-with-the-api.md`. Ele é escrito para este
  cliente e responde quase tudo — endereço, `X-Forwarded-For`, envelope de erro, sessão e
  cookie de refresh, as rotas que são contrato. **O que faltar lá é buraco no guia**: avise
  que ele precisa crescer, em vez de garimpar em `apps/api/docs/reference/endpoints.md`
  (lista de rotas) ou nos ADRs da API (`apps/api/docs/adr/`), que são o racional interno dela
  e não foram escritos para quem consome.

**Conta pendente não entra.** O login da API recusa em **cinco** condições, nesta ordem, e a
interface **ramifica pelo `code` do envelope de erro** — nunca pela `message`, que é prosa em
pt-BR e pode ser reescrita a qualquer momento:

| Condição | Status | `code` |
|---|---|---|
| Email desconhecido ou senha errada | 401 | `UNAUTHORIZED` |
| Conta travada por tentativas erradas | 429 | `TOO_MANY_REQUESTS` (com `Retry-After`) |
| Conta banida | 403 | `ACCOUNT_BANNED` |
| Troca de senha forçada | 403 | `PASSWORD_RESET_REQUIRED` |
| Conta não verificada | 403 | `EMAIL_NOT_VERIFIED` |

As duas primeiras são deliberadamente indistinguíveis entre si. As três de 403 só disparam
**depois** de a senha conferir — quem as recebe é o dono da conta, então distingui-las não
vaza nada. O 429 é **um só `code`** para lockout da conta e para rate limit por IP: a tela
mostra o `Retry-After` e não afirma qual dos dois foi.

**Nenhuma** delas deixa a pessoa alcançar o interior da aplicação. Consequência de desenho:
não existe aviso de "verifique seu email" dentro da aplicação, porque ninguém pendente chega
lá — esse aviso e o reenvio da verificação vivem **na tela de login**. Interface que assuma o
contrário será refeita.

## ⚠️ REGRA — Toda cor e todo componente nasce com a versão dark

Sem exceção, e vale para cada peça nova. Detalhe e racional em
[`docs/design-system.md`](docs/design-system.md).

---

## Stack

Next 16 (App Router) · React 19 · TypeScript strict (o `tsconfig.json` estende o preset Next
de `@pet-oasis/tsconfig`, em `packages/tsconfig`, e guarda só o `paths` do diretório; mesmo
desenho para o Biome, base em `packages/biome-config` mais os domínios `next`/`react` e o
parser de Tailwind, que são só deste app) · Tailwind 4 (CSS-first: os tokens vivem em
`@theme`, **não existe `tailwind.config.js`**) · shadcn 4 · `iron-session` 9 ·
`@pet-oasis/api-contracts` (schemas Zod, views, `ERROR_CODES`, tabela de rotas) · Zod 4, do
`catalog:`, como dependência **direta** — o web escreve `z.infer` sobre os schemas do
contrato, e o pnpm é estrito · Motion 13 ·
Biome · Vitest + Testing Library + Playwright · Node 24 · pnpm (o do workspace).

**Biome sozinho**, sem ESLint: o domínio `next` do Biome auto-ativa ao detectar `next@>=14`
e cobre `noImgElement`, `noSyncScripts`, `noNextAsyncClientComponent`, `useInlineScriptId`,
entre outras. A única regra do `eslint-config-next` sem equivalente é
`no-html-link-for-pages`, que é de Pages Router e não se aplica aqui.

## Arquitetura

- **BFF** (ADR-0001): a sessão vive num cookie `httpOnly` criptografado do domínio do front;
  o token nunca chega ao JavaScript. Rotação **proativa no middleware**, com as três travas
  contra falso positivo de reuso descritas no ADR — mexer nelas sem ler o ADR desloga
  usuários de todos os dispositivos. A janela de graça de 10s da API é rede de segurança para
  a corrida que sobra, **não licença** para renovar em paralelo: as travas ficam. O refresh
  token da API viaja em cookie (`Path=/api/v1/auth`) e **nunca chega ao navegador**: o BFF lê
  o `Set-Cookie`, guarda na sessão própria (7 dias deslizantes, como o refresh) e reenvia
  como `Cookie` em `/auth/refresh` e `/auth/logout`.
- **Server-first** (ADR-0002): máximo de Server Components. `"use client"` só quando a
  interação exigir. Leitura por RSC com `searchParams` como estado de lista; escrita por
  Server Actions.
- **Chamadas server-side vão pela rede interna do Docker**, nunca pela URL pública. Só URL
  de imagem é pública.
- **Capabilities**: `GET /me` por requisição, envolto em `cache()`. O cookie guarda apenas
  tokens e `userId`.

## Superfícies

`(storefront)` Vitrine, anônima e com ISR · `(auth)` login e afins · `(account)` Área do
cliente · `(admin)/admin` Back-office. Usuário **híbrido** (os dois perfis) é caso de
primeira classe: cai no back-office e troca de contexto por um switcher permanente no
header.

**Contrato inegociável de rotas** — os emails da API montam estes caminhos a partir do
`APP_URL` dela, e renomear qualquer um quebra o email sem erro visível em lugar nenhum:

```
/verify-email?token=      /reset-password?token=
/confirm-email-change?token=      /confirm-account-reactivation?token=
```

## Erro e carregamento

| Resposta | Tratamento |
|---|---|
| **400** (token imprestável) | **Estado esperado da página**, não erro de sistema: explica que o link é inválido ou expirou e oferece pedir outro. A API responde 400 genérico para token inexistente, expirado **ou** já usado, sem revelar qual — é anti-enumeração dela, não descuido |
| 401 **no login** | Credencial inválida (`UNAUTHORIZED`) — e só isso: email desconhecido e senha errada são indistinguíveis de propósito |
| 401 **em rota autenticada** | Redirect pro login preservando `?next=`, sem mensagem de erro — expirar não é falha do usuário |
| 403 **no login** | **Estado esperado da tela**, não erro de sistema: ramifica por `code` (`ACCOUNT_BANNED`, `PASSWORD_RESET_REQUIRED`, `EMAIL_NOT_VERIFIED`), cada um com sua explicação e seu caminho de volta |
| 403 **em rota autenticada** | Toast barulhento — é sinal de `can()` esquecido |
| 409 | Inline quando a resposta nomeia o campo; toast quando não |
| 422 | Inline por campo, via `useActionState` — nunca toast |
| 429 **no login** | Muitas tentativas: mostra **quanto tempo esperar**, lido do `Retry-After`. Lockout da conta e rate limit por IP respondem o mesmo `code` — a mensagem não afirma qual foi |
| 429 | Mensagem com o tempo de espera do `Retry-After`, nunca genérica |
| 503 **no `/auth/refresh`** | **Retentável, e não destrói sessão nenhuma**: é a API dizendo que não conseguiu reproduzir o par dentro da janela de graça, em vez de decidir entre concorrência e roubo. Tratar como falha de sistema desloga alguém à toa |
| 5xx | `error.tsx` com retry |

Carregamento por streaming com Suspense e skeleton espelhando o layout real. Nunca spinner
de página inteira.

## Testes

**Não escrevemos teste de markup** (ADR-0005 — leia antes de concluir que faltou
disciplina). Teste dirige as costuras que têm regra: sessão e rotação, mapeamento do 422,
conversão de centavos, `can()`, `apiFetch`.

**Existem duas costuras, e só duas:**

1. **Playwright** — navegador, aplicação e API real em Docker. Nada é falsificado.
2. **A fronteira do módulo de sessão** — relógio e cliente da API injetados. Existe por um
   motivo único: o access token vive 15 minutos, e provar a renovação na margem pela costura 1
   exigiria esperar 14 minutos. *Single-flight* e prefetch também não são determinísticos via
   navegador.

Pergunta de controle antes de escrever qualquer teste: **o que este teste finge?** "Nada" é a
costura 1. "O relógio e o cliente da API" é a costura 2. Qualquer outra resposta é uma costura
nova, e costura nova precisa de justificativa explícita — cada coisa falsificada é uma mentira
a manter, e mentira desatualizada deixa o teste passando com a aplicação quebrada.

Funções puras (`can()`, conversão do envelope de erro) **não são costuras**: não há dependência
a substituir. São testadas direto.

**Não há biblioteca de interceptação de rede no projeto.** A costura 1 usa rede real e a 2 usa
injeção; uma terceira forma de falsificar a mesma coisa seria uma a mais.

## Convenções

- **Idioma**: interface e documentação em **pt-BR**; código, identificadores, nomes de
  arquivo e mensagens de commit em **inglês**.
- **Dinheiro em centavos inteiros**, peso em gramas: como vêm da API. Formatação só pelo
  componente `Money`.

## Comandos

O web é o projeto `web` do workspace pnpm e vive em **`apps/web`**. Todo script abaixo é dele:
roda de dentro de `apps/web` (`pnpm run <script>`) ou da raiz com `pnpm --filter web <script>`.
O `pnpm install` é um só, o do workspace. A raiz tem `typecheck`, `lint`, `build` e `dev`, que
delegam ao Turborepo e cobrem o web junto dos outros pacotes — para o web só,
`pnpm <task> --filter=@pet-oasis/web` (nome completo; o Turbo não aceita `web` sem escopo).

- Dev: `pnpm run dev` — **no host, na porta 3001** (a API ocupa a 3000), contra a API
  dockerizada (`pnpm run dev` em `apps/api`, ou `pnpm dev` na raiz, que sobe os dois). Não há
  serviço `web` no Compose de dev, de propósito: HMR nativo, sem container.
- Build: `pnpm run build` (emite o bundle standalone) · `pnpm start` serve o build na 3001.
- Typecheck: `pnpm run typecheck` (gera os tipos de rota do Next e roda `tsc --noEmit`) ·
  Lint: `pnpm run lint` · com fix: `lint:fix` · Format: `format`.
- Contraste: `pnpm run contrast` mede cada par de cor do `globals.css` e falha abaixo de AA
  (ver `docs/design-system.md`).
- Produção: **na raiz**, `pnpm prod:up` (o stack inteiro) ou `pnpm prod:up web` (só este
  serviço; a API continua rodando a imagem que já tinha). O container entra em duas redes do
  stack unificado (`infra/` da raiz): a que o liga à API (`http://api:3000`) e a `proxy` do
  nginx, externa (ADR-0004). As variáveis dele vivem em `apps/web/.env.production` (fora do
  git; `.env.example` versionado).
- Doc: `pnpm docs:check` **na raiz** — varre o monorepo inteiro, este app incluído.

## Onde está a documentação do web

- **Vocabulário:** `CONTEXT.md` (glossário puro; formato da skill `domain-modeling`). Termo
  novo entra lá, só o termo; o porquê vai para um ADR. O mapa dos contextos do sistema é o
  `CONTEXT-MAP.md` da raiz.
- **O porquê de cada decisão:** um ADR por decisão em `docs/adr/`, índice em
  `docs/adr/README.md`. Decisão nova = ADR novo + linha no índice.
- **Direção visual:** `docs/design-system.md` — tokens, contrastes medidos, o que foi editado
  nos componentes gerados pelo shadcn.
- **Tracker e índice das fases:** na raiz — `.scratch/` (a espinha de autenticação é
  `.scratch/fase-12-web-auth-spine/`, a Fase 12) e `docs/todo.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
