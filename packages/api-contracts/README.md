# `@pet-oasis/api-contracts`

O que atravessa a rede entre a API e os clientes (web hoje; mobile e back-office amanhã):
enums de domínio, nomes de role e feature, o shape de erro e — nas fases seguintes — os
schemas de request e as views de resposta. **Só depende de `zod`.** Qualquer outro import é
sinal de que a coisa não é contrato (Prisma, Express, helper de servidor), e um teste do
próprio pacote fica vermelho se isso acontecer.

## O que há aqui

| Entrada | Conteúdo |
|---|---|
| `@pet-oasis/api-contracts` | tudo abaixo, mais `DOMAIN_ENUMS` (o registro dos enums com dois donos) |
| `…/user` | `profileKindSchema`/`ProfileKind`, `userStatusSchema`/`UserStatus` |
| `…/pet` | `petSpeciesSchema`/`PetSpecies`, `petSexSchema`/`PetSex` |
| `…/catalog` | `productStatusSchema`/`ProductStatus` |
| `…/role` | `ROLE_NAMES`, `RoleName`, `roleNameSchema` |
| `…/feature` | `FEATURE_NAMES`, `FeatureName`, `featureNameSchema`, `PRIVILEGED_FEATURES` |
| `…/errors` | `ERROR_CODES`/`ErrorCode`, `errorResponseSchema`, `validationErrorResponseSchema` e os tipos |

Cada domínio é uma entrada própria do `exports` para o consumidor importar só o que usa; o
índice reexporta tudo. Domínio novo = pasta nova em `src/` + entrada nova no `exports`.

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
pnpm --filter @pet-oasis/api-contracts test        # pureza + shape de erro + registro de enums
```

Os três também rodam pelo Turbo da raiz (`pnpm typecheck`, `pnpm lint`, `pnpm test`).
