# 09: `api-contracts` — fundação

**What to build:** o pacote `@pet-oasis/api-contracts` existe em `packages/`, com o que **não
depende de nenhum schema** da API: os enums de domínio como `z.enum`, as constantes de nomes de
role e feature (inclusive o conjunto privilegiado), o shape de erro da API, e a guarda que
prova que o pacote só depende de `zod`. A API ainda **não consome** nada dele — é o "expand"
do refactor largo; a migração dos consumidores é a issue 10.

**Blocked by:** 03.

**Status:** ready-for-agent

- [ ] Pacote privado escopado, estendendo o preset de biblioteca do `@pet-oasis/tsconfig` e a
      base do `biome-config`; `exports` com entradas por domínio (`auth`, `user`, `catalog`…)
      além do índice — decidir se o consumo é do fonte TS ou de `dist` buildado, registrar a
      decisão no README do pacote e refletir no `turbo.json`.
- [ ] Enums de domínio (todos os que os schemas da API hoje importam do Prisma gerado) definidos
      como `z.enum([...])` no contrato, com o tipo derivado exportado.
- [ ] **Teste de paridade** na API: para cada enum exportado pelo contrato, os `options` são
      exatamente os valores do enum gerado pelo Prisma correspondente. Um valor a mais ou a
      menos de qualquer lado é teste vermelho.
- [ ] Nomes de role e de feature, e o conjunto de features privilegiadas, exportados do
      contrato como constantes tipadas (`as const` + union). Os `*.constants.ts` da API passam
      a **reexportar** do contrato (expand: nenhum import da API muda ainda).
- [ ] Shape de erro exportado: envelope comum, `code` conhecidos (401/403/409/422/404), o
      `errors` por campo do 422 — como schema Zod e tipo.
- [ ] **Guarda de pureza** (teste no próprio pacote): `dependencies` do `package.json` é
      exatamente `{ zod }`; nenhum arquivo do pacote importa de fora dele (sem `@/`, sem
      `apps/`, sem `@prisma`, sem caminho relativo que saia de `src`).
- [ ] O pacote tem `typecheck`, `lint` e `test` próprios (Vitest), rodando pelo Turbo da raiz.
- [ ] Suíte da API + do pacote + `typecheck` + `lint` + `docs:check` verdes; `CLAUDE.md` da raiz
      ganha a regra "o contrato só depende de `zod`; enum tem dois donos e um teste".
