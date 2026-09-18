# 04: Turborepo

**What to build:** da raiz, um comando roda `typecheck`, `lint` e `build` de todo o workspace,
na ordem certa, cacheando o que não mudou; `test` roda sem cache; `dev` na raiz sobe todos os
apps, e `--filter` sobe um só. É a camada que transforma "vários pacotes" em "um pipeline".

**Blocked by:** 03.

**Status:** fechada em 2026-09-18

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] `turbo` é devDependency da raiz, pinado exato em **2.10.13** — não o 2.11.1, que era o
      `latest`: saiu há horas e o `pnpm add` só o aceitava furando o `minimumReleaseAge` do
      pnpm 12 (acrescentou `minimumReleaseAgeExclude` sozinho); a guarda vale mais que o
      minor. `turbo.json` declara `typecheck`, `lint`, `build`, `test`, `dev` e `docs:check`,
      com o porquê de cada escolha em comentário (o Turbo lê JSONC).
- [x] `typecheck`, `lint`, `build` e `docs:check` cacheiam; `build` declara `outputs:
      ["dist/**"]` e o `dist/` apagado volta do cache. Rodar duas vezes sem mudança devolve
      `FULL TURBO`. Duas descobertas por teste negativo que mudaram o desenho: **(1)** sem
      `dependsOn: ["^…"]`, o hash de uma task só vê os arquivos do próprio pacote — mudar a
      base do Biome devolvia o `lint` da API verde do cache. O `^` cria um nó por dependência
      (mesmo sem o script, `<NONEXISTENT>`) cujo hash cobre os arquivos dela. Por isso `lint`
      tem `^lint` (forma do exemplo do próprio Turbo) e `typecheck`/`build`/`test` têm
      `^build` — já é a ordem certa para quando o contrato tiver build. **(2)** O log que o
      Turbo grava em `<pacote>/.turbo/` é untracked e entrava no hash: toda rodada era cache
      miss até `.turbo/` entrar no `.gitignore`.
- [x] `test` tem `cache: false`; `dev` é `persistent: true` e `cache: false`.
- [x] Scripts da raiz delegam ao Turbo (`dev`, `build`, `typecheck`, `lint`, `test`,
      `docs:check`). `pnpm dev --filter=…` chega ao Turbo (o pnpm repassa a flag ao script),
      mas o nome tem de ser **com escopo**: `--filter=@pet-oasis/api` (ou `./apps/api`) — o
      Turbo não casa `api` com `@pet-oasis/api` como o `pnpm --filter api` faz. Provado por
      uso: `pnpm dev --filter=@pet-oasis/api` sobe só a API e um SIGINT derruba o Compose com
      graça. `db:*`, `prod:*`, `dev:*` e `test:services:*` continuam na API.
- [x] Nenhuma task cacheada lê ambiente (só arquivos), então não há `env`/`globalEnv` — o
      comentário no `turbo.json` diz quando passaria a haver. O modo estrito já deixa passar
      `HOME`, `PATH` e `DOCKER_*` (provado com uma task descartável que imprimiu o `env`):
      `test` e `dev` rodam sem `passThroughEnv`.
- [x] `.turbo/` no `.gitignore` da raiz (só a raiz: só o Turbo produz, e o Turbo é da raiz);
      `docs:check` roda da raiz como task, cacheada (só lê arquivos versionados da API).
- [x] Suíte completa + `typecheck` + `lint` + `docs:check` verdes via Turbo. README da raiz
      com a tabela de comandos e "o que é cacheado, e por quê"; a decisão em
      `docs/context/architecture.md` (11.4), indexada; `CLAUDE.md` da API aponta os scripts
      da raiz na seção de comandos.
