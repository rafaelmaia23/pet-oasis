# 04: Turborepo

**What to build:** da raiz, um comando roda `typecheck`, `lint` e `build` de todo o workspace,
na ordem certa, cacheando o que não mudou; `test` roda sem cache; `dev` na raiz sobe todos os
apps, e `--filter` sobe um só. É a camada que transforma "vários pacotes" em "um pipeline".

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] `turbo` é dependência de dev da raiz, pinado; `turbo.json` declara as tasks `typecheck`,
      `lint`, `build`, `test`, `dev`, `docs:check`.
- [ ] `typecheck`, `lint` e `build` são cacheados, com `outputs` declarados onde há saída
      (`dist`) e `dependsOn: ["^build"]` onde um pacote consome o build de outro. Rodar duas
      vezes sem mudança devolve `FULL TURBO` (cache hit) na segunda.
- [ ] `test` tem `cache: false` — sobe Postgres via Compose e lê `.env.test`; cachear é
      decisão explícita para depois. `dev` é `persistent: true` e `cache: false`.
- [ ] Os scripts da raiz delegam ao Turbo (`pnpm typecheck`, `pnpm lint`, `pnpm test`,
      `pnpm build`, `pnpm dev`); `pnpm dev --filter=api` sobe só a API; os scripts que são da
      API (`db:*`, `prod:*`, `dev:*`, `test:services:*`) continuam no `package.json` dela e
      são chamados por `pnpm --filter api …`.
- [ ] Variáveis de ambiente que afetam o resultado de uma task cacheada (se houver) são
      declaradas em `env`/`globalEnv`, para que o cache não devolva verde de outro ambiente.
- [ ] `.turbo` está no `.gitignore`; `docs:check` roda da raiz como task.
- [ ] Suíte completa + `typecheck` + `lint` + `docs:check` verdes via Turbo; o README da raiz
      explica os comandos e o que é cacheado.
