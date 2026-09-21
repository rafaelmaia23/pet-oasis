# `@pet-oasis/api-contracts`

O que atravessa a rede entre a API e os clientes (web hoje; mobile e back-office amanhã): os
schemas de request (create, update, query, path), as views de resposta, os enums de domínio,
os nomes de role e feature, a taxonomia de auditoria, a paginação e o shape de erro. **Só
depende de `zod`.** Qualquer outro import é sinal de que a coisa não é contrato (Prisma,
Express, helper de servidor), e um teste do próprio pacote fica vermelho se isso acontecer.

A API não tem schema próprio: controllers, presenters, a geração do OpenAPI e os testes
importam daqui. O que a API guarda é o que precisa de algo além de `zod` — o helper de
whitelist que aplica a view (`createPresenter`), a resolução de view por feature efetiva, a
derivação de slug, os helpers de paginação do repository, a máscara de IP do audit log — sempre
como composição por cima do schema do contrato.

## O que há aqui

| Entrada | Conteúdo |
|---|---|
| `@pet-oasis/api-contracts` | tudo abaixo, mais `DOMAIN_ENUMS` (o registro dos enums com dois donos) |
| `…/user` | `profileKindSchema`/`userStatusSchema`; peças de identidade (`emailSchema`, `cpfSchema`, `phoneSchema`, `passwordSchema` e os tetos); schemas de user e de perfil; `userViews` |
| `…/auth` | login, verificação, reset e troca de senha/email, reativação; `OPAQUE_TOKEN_LENGTH`; `accessTokenViews` (o `{ accessToken, expiresIn }` de login e refresh), `sessionViews` |
| `…/me` | `meViews` |
| `…/role` | `ROLE_NAMES`, `RoleName`, `roleNameSchema`; `roleParamsSchema`; `roleViews` |
| `…/feature` | `FEATURE_NAMES`, `FeatureName`, `featureNameSchema`, `PERMISSION_FEATURES`, `PRIVILEGED_FEATURES`; `featureParamsSchema`; `featureViews` |
| `…/permission` | params de role↔user e override; `userFeatureViews`, `effectiveFeaturesViews` |
| `…/pet` | `petSpeciesSchema`, `petSexSchema`; schemas de pet e de raça; `petViews`, `breedViews` |
| `…/catalog` | `productStatusSchema`; `catalogNameSchema`, `slugSchema`, `catalogDescriptionSchema`; schemas e views de marca, categoria (recursiva), tag, produto (escada `public`/`internal`/`cost`, detalhe × lista), variante e imagem; `MAX_IMAGES_PER_PRODUCT` |
| `…/audit-log` | `AUDIT_ACTIONS`, `AUDIT_TARGET_TYPES`; `listAuditLogsSchema`; `auditLogViews` |
| `…/log` | `listRecentLogsSchema` |
| `…/pagination` | `offsetQuerySchema`, `cursorQuerySchema`, `buildOffsetQuerySchema`, `defineSortConfig`, `offsetMetaSchema`, `cursorMetaSchema`, `DEFAULT_LIMIT`/`MAX_LIMIT` |
| `…/errors` | `ERROR_CODES`/`ErrorCode`, `errorResponseSchema`, `validationErrorResponseSchema` e os tipos |

Cada domínio é uma entrada própria do `exports` para o consumidor importar só o que usa; o
índice reexporta tudo. Domínio novo = pasta nova em `src/` + entrada nova no `exports`. Dentro
de um domínio, request vai em `*.schema.ts` e resposta em `*.views.ts`; enums e nomes vivem em
arquivos folha (`user.enums.ts`, `role.names.ts`, …) e **todo import entre domínios aponta para a
folha, nunca para o índice** — é o que impede um ciclo (`user → role → user`) de virar erro de
inicialização.

## Consumido do fonte TS, sem build

O `exports` aponta para `src/**/*.ts`, não para um `dist/`. É o padrão que o Turborepo chama
de *just-in-time package*: quem compila o contrato é o consumidor, com o próprio toolchain.
Todos os consumidores do workspace já compilam TypeScript — o tsup/esbuild que bundla a API, o
`tsx watch` do container de dev, o Vite por baixo do Vitest e o Next (com
`transpilePackages: ["@pet-oasis/api-contracts"]`, a única configuração que o web precisa).

O que se ganha: nenhum passo de build entre editar o contrato e vê-lo no consumidor, nenhum
`dist/` obsoleto para o IDE resolver por engano, `turbo.jsonc` sem task de build para o pacote,
e o Dockerfile da API não muda — o `COPY packages packages` que já existia entrega o fonte.

O que se paga, e onde está pago:

- **O tsup externaliza toda `dependency` por padrão.** Um `import` do contrato deixado no
  `dist/server.js` apontaria para um `.ts` e só rodaria pelo type stripping do Node — frágil
  demais para produção. Por isso o `tsup.config.ts` da API tem
  `noExternal: ["@pet-oasis/api-contracts"]`: o pacote é inlinado no bundle, e o `zod` que ele
  importa continua externo, porque é dependência da própria API. O `pnpm deploy --prod` ainda
  materializa o pacote em `node_modules` da imagem (é `dependency`), mas o bundle não o lê.
- **Cada consumidor typechecka o fonte do contrato com o próprio `tsconfig`.** A garantia de
  que ele compila sob o preset mais estrito do workspace vem do `typecheck` **deste** pacote,
  que roda sob `tsconfig.library.json` (só `esnext`, sem DOM nem Node) — um `Buffer` ou
  `window` que escapasse para cá chegaria ao web por arrasto. Os testes precisam do Node (a
  guarda de pureza lê `src/` pelo filesystem) e têm o próprio programa, `tsconfig.test.json`.
- **Se um dia um consumidor não compilar TS** (uma ferramenta que só lê `.js`/`.d.ts`), o
  pacote ganha build e o `exports` passa a apontar para `dist/`. O `turbo.jsonc` já declara
  `typecheck` e `build` atrás de `^build`, então a ordem está pronta — o que muda é o
  `package.json` daqui e uma linha no estágio `build` do Dockerfile da API (buildar o contrato
  antes do tsup).

## Enums têm dois donos, com prova

O Prisma continua dono do banco; o contrato é dono do que atravessa a rede. Cada enum é
declarado duas vezes de propósito, e um teste na API (`tests/unit/contracts/enumParity.test.ts`)
percorre `DOMAIN_ENUMS` e compara os `.options` de cada `z.enum` com os valores do enum gerado
pelo Prisma de mesmo nome. Um valor a mais ou a menos de qualquer lado, um enum novo no
`schema.prisma` sem entrada aqui (ou sem ser declarado interno lá), um enum novo aqui sem par no
Prisma — tudo é teste vermelho, não bug em produção.

## Scripts

```bash
pnpm --filter @pet-oasis/api-contracts typecheck   # src como biblioteca + tests como Node
pnpm --filter @pet-oasis/api-contracts lint
pnpm --filter @pet-oasis/api-contracts test        # pureza, shape de erro, registro de enums, paginação, audit
```

Os três também rodam pelo Turbo da raiz (`pnpm typecheck`, `pnpm lint`, `pnpm test`).
