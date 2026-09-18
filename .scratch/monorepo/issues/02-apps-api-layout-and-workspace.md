# 02: Layout `apps/api` e o workspace-de-um

**What to build:** o repositório passa a ter a forma de monorepo — `pnpm-workspace.yaml` e um
`package.json` de raiz — com a API vivendo inteira em `apps/api`, e tudo que funcionava na
issue 01 continua funcionando de dentro do app. É o commit de move: um só, mecânico, e
registrado para que o `git blame` continue apontando o autor real de cada linha.

**Blocked by:** 01.

**Status:** fechada em 2026-09-18

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] Tudo que é da API desce para `apps/api` num único commit de move (`9a4a3d1`, 498
      renames, 0 linhas alteradas): fonte, testes, prisma, infra, docs, tsconfig, biome, vitest,
      tsup, Dockerfile, `.dockerignore`, `api-collection`, `tools`, `.env.*`, `uploads` — **e
      também** `.scratch/`, `CLAUDE.md` e `README.md`, porque "a API inteira" inclui o tracker e
      os guias dela, e a issue 07 é quem sobe para a raiz o que é do sistema. Ficam na raiz só
      `LICENSE`, `.vscode/` (aponta o Biome para `apps/api/node_modules/.bin/biome`) e o que é
      do workspace.
- [x] A raiz tem `package.json` (privado, só `packageManager`/`engines`, sem dependências) e
      `pnpm-workspace.yaml` (`apps/*`, `packages/*`, mais os settings e o `allowBuilds` da 01).
      Um só `pnpm-lock.yaml`, na raiz — o diff dele é só o importer mudando de `.` para
      `apps/api`; nenhuma versão resolvida mudou. O pacote da API chama-se **`@pet-oasis/api`**, no
      escopo que a spec fixa para todo pacote do workspace — e `pnpm --filter api` (desta issue,
      do Dockerfile e da 11) continua valendo: um filtro sem escopo casa o pacote escopado quando
      o nome é único no workspace (verificado com o `docs:check` e com o `deploy` do Dockerfile).
- [x] `.git-blame-ignore-revs` na raiz com o hash do move; `git config blame.ignoreRevsFile`
      ativado neste clone e documentado em `docs/guides/dev.md` (é por clone; o GitHub lê o
      arquivo sozinho).
- [x] Compose continua em `apps/api/infra`; `context: ../../..` + `dockerfile: apps/api/Dockerfile`.
      O `runtime` recebe só as dependências de produção da API via
      `pnpm --filter api deploy --prod /deploy` (autocontido; o `pnpm prune --prod` da 01 podaria a
      store compartilhada do workspace) e continua **raso em `/app`** — mounts, `WORKDIR` e os
      `docker exec pet-oasis-api node dist/…` das units não mudam. O stage `dev` espelha o repo
      (`/workspace/apps/api`) porque o `tsx` precisa do `node_modules` do workspace; os bind
      mounts do override de dev apontam para lá. Nada de `injectWorkspacePackages`: o `deploy`
      do pnpm 12 só o exige quando há dependência de workspace, e ainda não há.
- [x] O ignore vale para o contexto novo e chama-se **`apps/api/Dockerfile.dockerignore`** (o
      Docker lê o `<Dockerfile>.dockerignore` antes do `.dockerignore` da raiz): um ignore por
      app, porque o que a API exclui é o que o outro app precisa. Exclui `**/node_modules`,
      `**/dist`, `**/.env*`, tests, docs, tracker, Compose, cron — e deixa entrar os entrypoints.
- [x] `@/`, `rootDir`, `include` do Biome, `globalSetup` do Vitest e `tools/` funcionam de
      dentro do app **sem mudança** — todos já eram relativos ao diretório do app. Mudou só o
      comentário de `src/lib/sentry.ts` (o cwd é o diretório da API nos três ambientes) e o
      `chown` do entrypoint de dev, que era `/app/uploads` e virou relativo ao cwd.
- [x] Da raiz, `pnpm --filter api <script>` roda qualquer script; de `apps/api`, `pnpm run` também
      (o corepack sobe até o `packageManager` da raiz).
- [x] Suíte completa (1292) + `typecheck` + `lint` + `docs:check` verdes da raiz e de dentro do
      app; três targets buildam; `pnpm run dev` sobe (generate como root → cai para o uid do
      host → migrate → seed → watch) e responde 200; `prod:up` sobe e responde 200 pela rede
      `pet-oasis` (verificado com rede e `UPLOAD_HOST_DIR` descartáveis, como na 01).
- [x] README da API, guias de dev e deploy e `CLAUDE.md` dizem `cd pet-oasis/apps/api` e
      `pnpm --filter api`; a raiz ganhou um `README.md` curto e um `CLAUDE.md` provisório que só
      importa o da API (`@apps/api/CLAUDE.md`) até a 07. O porquê do contexto de build e do
      `deploy` está em `docs/context/infrastructure.md` (indexado). `.gitignore` da raiz cobre
      `node_modules`, `dist`, `.env.*`, `**/uploads`, `**/src/generated` e `.learning/`; o do app
      continua o de antes.
