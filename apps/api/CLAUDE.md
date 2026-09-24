# pet-oasis — API: guia para o Claude Code

Este arquivo guarda **só o que é específico da API**: stack, camadas, módulos, regras de negócio
já decididas, convenções de código e comandos. Tudo que vale para o monorepo inteiro — a regra
de nunca decidir regra de negócio, TDD, o fluxo de branches por fase, a convenção de commits (e
a proibição de trailer de agente), como ler o contexto, onde mora cada documento, o pipeline
das skills — está no **`CLAUDE.md` da raiz**, e vale aqui integralmente.

## Stack

TypeScript (tsconfig strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` — vem do preset `@pet-oasis/tsconfig`, em `packages/tsconfig`; o `tsconfig.json` da API estende o de Node e guarda só o que é relativo ao diretório; mesmo desenho para o Biome, base em `packages/biome-config`) · Node 24/Express · **pnpm** (pinado em `packageManager`, instalado pelo corepack; install estrito — dependência usada é dependência declarada) · Prisma 7 (driver adapter pg, output `src/generated/prisma`) · Zod 4 · Vitest+Supertest+Faker · Biome · JWT+bcrypt. Banco de teste na porta 5433.

## Arquitetura — camadas

Fluxo rígido: **route → controller → service (regras de negócio) → repository (Prisma)**. Cada camada só fala com a adjacente. Repository é a ÚNICA que toca o Prisma. Service tem as regras e orquestra. Nunca pule camadas.

**A rota é declarada num lugar só: a entrada da tabela do contrato.** `registerRoute`
(`src/lib/registerRoute.ts`) deriva dela tudo que a rota promete, e o controller é o **handler**:
recebe o envelope já validado e devolve o que a view descreve, sem `req`, sem `res`, sem `.parse()`
e sem status escrito à mão. A migração das 79 rotas corre na Fase 12
(`.scratch/fase-12-module-depth/`), então a forma antiga ainda convive — **rota nova nasce no
registrador**. Como se escreve uma: `docs/guides/documenting-endpoints.md` §3.

## Organização de módulos

Cada módulo em `src/modules/<nome>/` com: `*.route.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.presenter.ts` (o helper de whitelist aplicado sobre a view). **Os schemas Zod de request (create, update, query, path) e as views de resposta vivem no contrato** (`packages/api-contracts/src/<domínio>/`, `*.schema.ts` e `*.views.ts`), e a API os importa de `@pet-oasis/api-contracts/<domínio>` — controller, presenter e testes; não existe `*.schema.ts` em `src/modules/`. **A tabela de rotas também é do contrato** (`packages/api-contracts/src/routes/`): o `/openapi.json` é derivado dela por `src/docs/adapter.ts`, e `tests/unit/contracts/routeParity.test.ts` prova que ela e o router do Express não divergem. O que precisa de algo além de `zod` (helper de servidor, banco) fica na API como composição por cima do schema do contrato (ex.: `catalog.slug.ts`). Módulos: **user** (CRUD + perfis em subarquivos `user.profile.*`), **role** (read-only), **feature** (read-only), **permission** (overrides de feature), **auth** (login/sessão). Constantes de domínio (roles, features) em `*.constants.ts`, lidas pelo seed — os **nomes** vêm do contrato (`@pet-oasis/api-contracts`) e quem precisa deles importa de lá; a API guarda só o que o seed anexa a cada nome (descrição, features por role, `appliesTo`), num `Record<Name, …>` que o typecheck prova completo.

Padrões transversais: `lib/authorization.ts` (cômputo de features, `can`/`hasFeature`/`canActOnResource` e **`authorizeThenLoad`**, a primitiva que ordena autorização e carga — todo acesso a recurso por id passa por ela, ver `docs/adr/0011-autorizacao-sempre-antes-busca.md`), `utils/presenter.ts` (whitelist via Zod), error handler central, `errors/errorFactory.ts` (factories `create*`).

---

## Regras de negócio JÁ DECIDIDAS (siga, não re-decida)

**Modelo de usuário:** todo user tem ≥1 perfil (customer/employee, 1:1 por presença) e cada perfil tem ≥1 role. Perfil definido pela presença da relação, não por um campo "tipo".

**Autorização:** roles agregam features; `UserFeature` guarda só overrides (grant/deny), nunca cópias. **O override pendura na atribuição de role, não no usuário** (`UserFeature.userRoleId` → `UserRole`, Fase 8.0): override é sobre a função, então perder a role mata o ajuste fino dela. A identidade do recurso é a tripla `(user, role, feature)` e a role vai no path (`PUT|DELETE /users/:userId/roles/:roleId/features/:featureId`). `UserRole` tem `@@unique([userId, roleId])` — uma linha por par, para sempre, revivida na re-concessão. Features efetivas = `(⋃ roles ∪ grants) − denies`, computadas em runtime por `computeEffectiveFeatures` (função pura, dois laços: todas as estáticas antes de qualquer override). Wildcard `*` = admin pode tudo. Autorização SEMPRE antes da busca (403 vence 404).

**Roles read-only via API** (definidas em código, seed). Só o vínculo user↔role é gerenciável. `appliesTo` (EMPLOYEE/CUSTOMER/null) valida compatibilidade role↔perfil.

**Não-escalação:** conceder via override — ou atribuir uma role que contenha — uma feature de PRIVILEGED_FEATURES exige role **admin** (não só a feature). O conjunto é `PERMISSION_FEATURES` (read:feature, read:role, read:permission, manage:permission) **+ `read:audit-log:full`** (que destrava o IP inteiro no audit log; Fase 7.8). Definido no contrato (`@pet-oasis/api-contracts/feature`, `PRIVILEGED_FEATURES`); checado no `permission.service` buscando a role do ator. `read:log`/`read:audit-log` são normais (concedíveis sem ser admin).

**Soft delete** (preserva histórico para auditoria): User, Customer, Employee, UserRole, UserFeature têm `deletedAt`. TODAS as queries de leitura filtram `deletedAt: null` — incluindo `getUserForFeatureComputation` (é o que mata o token de deletado e ignora overrides removidos). Hard delete só em teardown de teste e nos scripts de faxina (`src/scripts/cleanup-*`). UserFeature/UserRole usam `id` próprio como PK (não par composto); a unicidade é do **banco** (`@@unique`), não do código.

**Cascata e restauração (Fase 8):** deletar desce quatro níveis — `User` → perfis → `UserRole` → `UserFeature` —, com **um único `new Date()` por transação** propagado por toda a cadeia (`user.lifecycle.repository.ts`). Nunca existe filho ativo de pai morto. Restaurar sobe só **dois** (`User` → perfil → `UserRole`): o perfil volta porque foi **nomeado**, as roles dele voltam por **correlação de `deletedAt`** com o do perfil, e **nenhum override ressuscita por efeito colateral** — só por `PUT` explícito na tripla. A assimetria é principiada: deletar demais é fail-closed, restaurar demais é vazamento de privilégio. Racional em `docs/adr/0005-authorization-scope-and-lifecycle.md`. `User` deletado tem caminho de volta (reativação por signup ou por admin, sempre confirmada pelo dono via token); **nunca** existe usuário ativo sem ao menos um perfil ativo.

**Validação:** sintática (Zod, sem banco) no controller; semântica (precisa de banco — appliesTo, etc.) no service. Ambas produzem 422 no mesmo shape (`errors` por campo). Unicidade pelo banco (P2002 → 409 no handler, lê `meta.driverAdapterError.cause.constraint.fields`).

**Erros:** factories `create*` retornam instâncias de subclasses de `AppError`; o caller dá `throw`. 422 VALIDATION_ERROR, 409 CONFLICT, 404 NOT_FOUND, 403 FORBIDDEN (action nomeia a feature), 401 UNAUTHORIZED.

**Tipos:** `FeatureName`/`RoleName` (union literal) onde se DIGITA o literal no código; `string` onde o dado vem do banco. A fronteira é banco/request — forçar o union além dela gera `as` (evite).

**Domínio pet shop (a partir da Fase 9):** `Product` é identidade comercial, `ProductVariant` é a unidade vendável (SKU/preço/estoque) — todo produto tem ≥1 variante, nunca produto plano. Espécie de pet (`PetSpecies`) é **faceta** do produto (`targetSpecies[]`), nunca nível da árvore de `Category` — categoria modela função, não espécie. Racional completo em `docs/adr/0006-pet-domain-modeling.md` e `docs/adr/0007-product-catalog-modeling.md`.

---

## Convenções de código

- Presenter (view Zod) por whitelist: `.parse()` derruba campos não listados → nada sensível vaza. View resolvida pela feature efetiva do viewer.
- Junção do Prisma sempre aninha (`user.roles` = `UserRole[]` com `.role` dentro); achate no service ou espelhe na view.
- `snake_case` no banco via `@map`; camelCase no código.
- Valores monetários em inteiro-**centavos** (`priceCents`, nunca `Decimal`/float); peso em inteiro-**gramas** (`weightGrams`). Mesmo racional dos dois: aritmética inteira, sem bug de ponto flutuante, sem `Decimal` do Prisma contaminando serialização/Zod.
- Schema de **update** é sempre `.strict()`; o que o endpoint recusa de propósito ganha `z.never` com mensagem própria. O service recebe o corpo **parseado**, nunca `req.body`. Todo schema de escrita novo (create, update, upsert) ganha um caso em `tests/integration/v1/mass-assignment.test.ts` no mesmo commit — a suíte existe para que um `.strict()` perdido num refactor fique vermelho (Fase 10.12; racional em `docs/adr/0127-mass-assignment-schema-update-strict-protecao-tem-teste.md`).
- Todo campo de **texto** de schema (corpo, query, path) nasce com `.max()` coerente com o que representa, e o motivo do número fica em comentário ao lado. Campo que é normalizado (`transform`) recebe o `.max()` **antes** da normalização — o teto é sobre o texto cru. Peças de identidade (`emailSchema`, `cpfSchema`, `phoneSchema`) vivem no contrato (`@pet-oasis/api-contracts/user`): reutilize, não copie (Fase 10.13).
- SQL cru vive **exclusivamente no repository**, via `$queryRaw` com template parametrizado — nunca concatenação, nunca fora dessa camada. Só é escrito quando o Prisma não expressa o que se precisa, e hoje isso acontece em **três** pontos: a busca textual (`tsvector`/`pg_trgm`, Fase 9.9 — ver `docs/adr/0009-text-search.md`) e dois locks de linha `SELECT ... FOR UPDATE` sobre o produto — o que serializa a atribuição de posição das imagens (Fase 9.10) e o que serializa a exclusão da última variante ativa (Fase 9.12). Ponto novo de SQL cru é decisão a justificar, não rotina.

## Comandos

A API é o projeto `api` do workspace pnpm do monorepo e vive em **`apps/api`**. Todo script abaixo é dela: roda de dentro de `apps/api` (`pnpm run <script>`) ou da raiz do monorepo com `pnpm --filter api <script>` — mesmo script, mesmo cwd. O `pnpm install` é um só, o do workspace (raiz: `pnpm-lock.yaml` + `pnpm-workspace.yaml`). A raiz também tem `typecheck`, `lint`, `build`, `test` e `dev`, que delegam ao **Turborepo** (`turbo.jsonc`) e rodam a task em todo pacote que a tiver, com cache nas três primeiras (`test` e `dev` não cacheiam) — para um pacote só, `pnpm <task> --filter=@pet-oasis/api` (nome completo; o Turbo não aceita `api` sem escopo). O que é cacheado e por quê está no ADR `docs/adr/0104-turborepo-pipeline-workspace-test-fica-fora-cache.md`; o README da raiz tem a tabela de comandos.

- Ambientes via Compose base + overrides — o stack é **do sistema** e vive em `infra/` da raiz do monorepo (API, web, Postgres, Redis, mailpit); os entrypoints ficam em `apps/api/infra/`, e o `Dockerfile` em `apps/api`, mas o **contexto de build é a raiz do monorepo** — o lockfile e o workspace vivem lá —, e o ignore dele é o `Dockerfile.dockerignore` ao lado (que deixa o web fora). Isolados por `-p pet-oasis-{dev,test,prod}`; env por arquivo (`.env.development`/`.env.test`/`.env.production`, em `apps/api`, fora do git; `.env.example` versionado — o de produção também é o `--env-file` de interpolação do stack: banco, portas, `UPLOAD_HOST_DIR`). Racional em `docs/adr/0002-environments-and-deploy.md` e nos ADRs do tema *Infraestrutura* (índice em `docs/adr/README.md`).
- Dev: `pnpm run dev` (Compose em foreground: db + mailpit + app-em-container via tsx watch; Ctrl+C = SIGTERM gracioso) · `dev:down` · `dev:reset` · `dev:mail` · `dev:db` (só o Postgres-de-dev, detached e healthy — é o pré-requisito dos `db:*` quando não se quer a stack em foreground).
- Teste: `pnpm test` (sobe o Postgres-de-test isolado, roda o Vitest no host e **sempre** derruba ao final, inclusive em falha; com `CI=true` no ambiente pula o Compose e chama o Vitest direto — é como o GitHub Actions roda, contra os `services` do job) · `test:coverage` · `test:watch` · helpers `test:services:up`/`down`. Testar 1 arquivo (com o test-db de pé): `pnpm exec vitest run <nome>` · watch: `pnpm exec vitest <nome>` · 1 caso: `-t "nome"`.
- Produção: **na raiz**, `pnpm prod:up` (o stack inteiro: API + web + Postgres + Redis; `migrate deploy` no entrypoint da API) ou `pnpm prod:up api` (reconstrói e reinicia só a API; o web continua rodando) · `prod:down` · `prod:logs`. Os `dev*` e `test:services:*` continuam aqui, apontando para o `infra/` da raiz — em dev e teste o stack é o da API, o web roda no host.
- Migration dev (autoria consciente): `pnpm run db:migrate` (roda com `.env.development`, já gera o client) · `db:generate` · `db:seed` · `db:studio`.
- Typecheck: `pnpm run typecheck` · Lint: `pnpm run lint` · Lint com fix: `pnpm run lint:fix` · Format: `pnpm run format`
- Doc: `pnpm docs:check` **na raiz** (é script da raiz, não task da API: varre o monorepo inteiro — todo caminho `docs/**.md` e toda âncora citados existem, inclusive nos comentários de `src/`).

---

## Onde está a documentação da API

- **Vocabulário:** `CONTEXT.md` (glossário puro — o que cada termo é e os sinônimos a evitar;
  formato da skill `domain-modeling`). Termo novo entra lá, só o termo; o porquê vai para um
  ADR. O mapa dos contextos do sistema é o `CONTEXT-MAP.md` da raiz.
- **O porquê de cada decisão:** um ADR por decisão em `docs/adr/`, com o **índice por tema** em
  `docs/adr/README.md` — leia o índice, ache a linha, abra **só** aquele ADR. Os `0001`–`0010`
  são as decisões estruturais; do `0011` em diante estão as que viviam nos antigos arquivos
  temáticos de `docs/context/` (migrados em 2026-09-18). Decisão nova = ADR novo + linha no índice.
- **Consulta:** `docs/reference/` — rotas (`endpoints.md`), política de log, schema
  (`schema.md`: por que uma coluna é assim, o que cada fase mudou, invariantes), histórico das
  fases (`history.md`).
- **Como fazer:** `docs/guides/` — dev, deploy, integrar com a API, documentar endpoint.
- **Tracker e índice das fases:** na raiz — `.scratch/` e `docs/todo.md`; backlog em
  `docs/reference/backlog.md` da raiz.

O mapa completo está em `docs/README.md`.
