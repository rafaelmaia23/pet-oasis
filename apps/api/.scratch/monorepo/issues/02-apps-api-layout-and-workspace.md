# 02: Layout `apps/api` e o workspace-de-um

**What to build:** o repositório passa a ter a forma de monorepo — `pnpm-workspace.yaml` e um
`package.json` de raiz — com a API vivendo inteira em `apps/api`, e tudo que funcionava na
issue 01 continua funcionando de dentro do app. É o commit de move: um só, mecânico, e
registrado para que o `git blame` continue apontando o autor real de cada linha.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Tudo que é da API (fonte, testes, prisma, infra, docs, tsconfig, biome, vitest, tsup,
      Dockerfile, `.dockerignore`, `api-collection`, `tools`, `.env.*`, `uploads`) desce para
      `apps/api` num único commit de move, sem alteração de conteúdo além dos caminhos.
- [ ] A raiz tem `package.json` (privado, com `packageManager`/`engines`, sem dependências de
      app) e `pnpm-workspace.yaml` listando `apps/*` e `packages/*`. Um só `pnpm-lock.yaml`, na
      raiz. O `pnpm-workspace.yaml` (settings + `allowBuilds`; a 01 não deixou `.npmrc`) sobe para a raiz.
- [ ] O hash do commit do move entra num `.git-blame-ignore-revs` na raiz, e o repo é configurado
      para usá-lo; `git blame` de um arquivo movido mostra o commit anterior ao move.
- [ ] Os arquivos de Compose continuam em `apps/api/infra` **nesta issue** (o stack unificado
      é da issue 11), mas o contexto de build passa a ser a **raiz do monorepo**, para que o
      Dockerfile veja o lockfile e o workspace; o Dockerfile instala o workspace e produz, no
      `runtime`, só as dependências de produção **da API** (`pnpm deploy --filter`), não o
      workspace inteiro.
- [ ] O `.dockerignore` que vale para o contexto novo exclui `node_modules` de todo nível e o
      que não é da API — e continua deixando entrar os entrypoints de `infra/`.
- [ ] Os aliases `@/` e o `rootDir` do tsconfig, o `include` do Biome, o `globalSetup` do Vitest
      e os caminhos em `tools/` funcionam de dentro do app.
- [ ] Da raiz, `pnpm --filter api <script>` roda qualquer script da API; de dentro de `apps/api`,
      `pnpm run <script>` também.
- [ ] Suíte completa + `typecheck` + `lint` + `docs:check` verdes; três targets do Docker
      buildam; `dev` e `prod:up` sobem e respondem.
- [ ] Guia de deploy e README descrevem o caminho novo (`cd apps/api` onde couber); `.gitignore`
      da raiz e do app cobrem `node_modules`, `dist`, `.env.*`, `uploads`, `src/generated`.
