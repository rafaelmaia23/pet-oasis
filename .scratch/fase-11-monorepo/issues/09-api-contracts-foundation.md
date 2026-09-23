# 09: `api-contracts` — fundação

**What to build:** o pacote `@pet-oasis/api-contracts` existe em `packages/`, com o que **não
depende de nenhum schema** da API: os enums de domínio como `z.enum`, as constantes de nomes de
role e feature (inclusive o conjunto privilegiado), o shape de erro da API, e a guarda que
prova que o pacote só depende de `zod`. A API ainda **não consome** nada dele — é o "expand"
do refactor largo; a migração dos consumidores é a issue 10.

**Blocked by:** 03.

**Status:** fechada em 2026-09-18

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] `packages/api-contracts` (`@pet-oasis/api-contracts`), privado, escopado, `type: module`,
      estendendo `tsconfig.library.json` e a base do `biome-config`. `exports` com o índice e
      uma entrada por domínio: `./user`, `./pet`, `./catalog`, `./role`, `./feature`,
      `./errors` (não `auth` — o que existe hoje de autorização são nomes de role e feature, e
      as entradas espelham os módulos da API para a issue 10 migrar módulo a módulo).
      **Decisão: consumo do fonte TS**, `exports` → `src/**/*.ts`, sem `dist` — todos os
      consumidores compilam TS (tsup, tsx, Vite, Next com `transpilePackages`). Registrado no
      README do pacote e em `apps/api/docs/adr/0198-contrato-consumido-do-fonte-ts-so-depende-de-zod-enum-dois-donos.md`; no `turbo.jsonc` o `^build`
      fica como nó vazio, com o comentário ajustado. O preço está pago no `tsup.config.ts` da
      API: `noExternal: ["@pet-oasis/api-contracts"]`, senão o `dist/` sairia com `import` de
      `.ts` (provado: o bundle tem zero imports do pacote, só comentários de caminho).
- [x] Cinco enums (`ProfileKind`, `UserStatus`, `PetSpecies`, `PetSex`, `ProductStatus`) como
      `z.enum` com tipo derivado — os que schemas e presenters importam do Prisma. Mais o
      registro `DOMAIN_ENUMS` (chave = nome do enum do Prisma), que é o que o teste de paridade
      percorre — e um teste no pacote exige que todo `z.enum` exportado do índice esteja no
      registro ou numa lista explícita de "sem par no Prisma" (revisão: enum esquecido do
      registro passava em silêncio).
- [x] Paridade em `apps/api/tests/unit/contracts/enumParity.test.ts`: para cada entrada de
      `DOMAIN_ENUMS`, `.options` = valores do enum gerado; e a lista dos dois lados é comparada
      — todo enum do Prisma está no registro **ou** numa lista explícita de internos (hoje só
      `VerificationPurpose`, que nunca sai do service). Provado por teste negativo (valor a mais
      no contrato → vermelho).
- [x] `ROLE_NAMES`/`RoleName`/`roleNameSchema`, `FEATURE_NAMES`/`FeatureName`/
      `featureNameSchema`, `PERMISSION_FEATURES` e `PRIVILEGED_FEATURES` no contrato. Os
      `*.constants.ts` da API reexportam e guardam só o que o seed anexa a cada nome:
      `feature.constants.ts` virou um
      `Record<FeatureName, string>` de descrições e `role.constants.ts` um
      `Record<RoleName, RoleDefinition>` — chave faltando ou sobrando é erro de typecheck
      (provado nos dois sentidos). `PERMISSION_FEATURES` também foi para o contrato, e
      `PRIVILEGED_FEATURES` é derivado dele lá (revisão: a cópia dos quatro nomes perdia o
      superconjunto por construção); `DEFAULT_FEATURES`/`DEFAULT_ROLES` mantêm o shape, na
      ordem do contrato. Nenhum import da API mudou além dos dois constants; o teste de
      `role.constants` ganhou dois casos fixando o alinhamento com o contrato.
- [x] Shape de erro: `errorResponseSchema` (envelope do `AppError.toJson()` + `requestId`),
      `validationErrorResponseSchema` (422, `errors` por campo) e `ERROR_CODES`/`errorCodeSchema`
      com **todos** os `code` que a API emite (não só os cinco do enunciado), inclusive os três
      403 de login. O `code` do envelope fica `z.string()` de propósito — `code` novo na API não
      pode quebrar o parse do cliente; o enum é para quem trata caso conhecido. Os `.meta()` do
      OpenAPI vieram junto — inclusive a descrição curta do `requestId` do 422, distinta da do
      envelope — para a issue 10 trocar o `components.ts` por import sem mudar o `openapi.json`.
- [x] Guarda de pureza em `packages/api-contracts/tests/purity.test.ts`: `dependencies` é
      exatamente `["zod"]` e nenhum especificador de `src/**/*.ts` é diferente de `zod` ou de
      relativo que fique dentro de `src/` (provado por teste negativo com `node:fs`).
- [x] `typecheck` (dois programas: `src/` como biblioteca sem DOM/Node, `tests/` como Node —
      a guarda lê o filesystem), `lint` e `test` (Vitest, sem config) no pacote; o Turbo da raiz
      os pega pelo script (`pnpm typecheck` = 2 tasks, `pnpm lint` = 4).
- [x] Dockerfile: nada a fazer, como previsto — o `COPY packages packages` entrega o fonte.
      Provado com os três targets buildando; o `runtime` tem o pacote materializado pelo
      `pnpm deploy --prod` (é `dependency`) e o `dist/server.js` sem import dele
      (`node --check` OK). Só o comentário do `COPY` foi atualizado e `packages/*/tests` entrou
      no `Dockerfile.dockerignore`.
- [x] Suíte da API (1301) + do pacote (10) + `typecheck` + `lint` + `docs:check` verdes.
      `CLAUDE.md` da raiz ganhou a regra "o contrato só depende de `zod`; enum tem dois donos e
      um teste"; o da API aponta o contrato como dono dos nomes e de `PRIVILEGED_FEATURES`;
      README da raiz lista o pacote; decisão em `apps/api/docs/adr/0198-contrato-consumido-do-fonte-ts-so-depende-de-zod-enum-dois-donos.md`, indexada.
