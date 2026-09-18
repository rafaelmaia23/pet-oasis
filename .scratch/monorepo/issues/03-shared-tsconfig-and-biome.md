# 03: `tsconfig` e `biome-config` compartilhados

**What to build:** os dois primeiros pacotes internos do workspace — presets de TypeScript e
a base do Biome — existem em `packages/`, e a API os consome por `workspace:*`. É a issue que
prova que dependência interna funciona (resolução, install, o pacote aparecer no lockfile) com
o pacote mais barato possível, antes de o contrato depender disso.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] `packages/tsconfig` (`@pet-oasis/tsconfig`) publica presets por alvo: um base estrito
      (com `exactOptionalPropertyTypes` e `noUncheckedIndexedAccess`), um para Node/app, um
      para Next, um para biblioteca. O da API estende o de Node e mantém **só** o que é dela
      (`rootDir`, `paths`, `types`, `typeRoots`).
- [ ] `packages/biome-config` (`@pet-oasis/biome-config`) publica a base (formatter, linter,
      estilo de aspas/ponto-e-vírgula); o `biome.json` da API a estende e mantém só os ignores
      que são dela (Prisma gerado, `api-collection`, `dist`, o constants de imagens fake).
- [ ] Os dois pacotes são privados, com `name` escopado, sem build (config pura), e aparecem
      como `workspace:*` nas `devDependencies` da API.
- [ ] Nenhuma regra de lint ou opção de compilador muda de valor efetivo para a API — provado
      por `typecheck` e `lint` verdes **sem** nenhuma alteração em `src/` ou `tests/`.
- [ ] Suíte completa + `typecheck` + `lint` + `docs:check` verdes; Docker `build` verde (o
      preset precisa entrar no contexto).
