# Schemas de request e views são código do pacote `@pet-oasis/api-contracts` (11.10)

> Decisão da Fase 11 (issue 10), registrada em 2026-09-19. Nasceu no antigo contexto temático da
> API (**Contratos de API**) enquanto ele era migrado para ADRs (issue 07), e por isso entrou
> aqui já como ADR, no fim da numeração. É o "contract" do refactor cujo "expand" está no
> [`0198`](0198-contrato-consumido-do-fonte-ts-so-depende-de-zod-enum-dois-donos.md). A regra
> acionável está no `CLAUDE.md` da API (*Organização de módulos*). Contexto de execução em
> `.scratch/fase-11-monorepo/issues/10-api-contracts-migrate-schemas.md`.

Todo schema de request (create, update, query, path) e toda view de resposta vivem em
`packages/api-contracts/src/<domínio>/` — `user`, `auth`, `me`, `role`, `feature`, `permission`,
`pet`, `catalog`, `audit-log`, `log`, `pagination`, `errors` —, e a API os **importa** de lá:
controllers, presenters, a geração do OpenAPI e testes. (A tabela de paths que ainda era da API
quando isto foi escrito também virou contrato logo depois, na issue 17 —
[`docs/adr/0003`](../../../../docs/adr/0003-route-table-is-contract-openapi-is-derived.md) da
raiz.) Nenhum `*.schema.ts` sobrou em
`apps/api/src/modules/`; os `*.presenter.ts` sobraram, mas só com o helper de whitelist aplicado
sobre a view importada (`createPresenter(userViews)`) e o que é serialização da API (`maskIp`).
A resolução de view por feature efetiva (`resolveUserView`, `readViewFor`) continua na API — quem sabe
o que o viewer pode é a API, não o contrato.

A fronteira foi decidida caso a caso pelo mesmo critério: **o que precisa de algo que não é
`zod` não é contrato**, e fica na API como composição por cima do schema do contrato.

- Enum do Prisma nos schemas (`z.enum(PetSpecies)`) virou o enum do contrato
  (`petSpeciesSchema`); o teste de paridade é o que mantém os dois donos iguais.
- Da paginação migrou o que o cliente manda e recebe (`offsetQuerySchema`, `cursorQuerySchema`,
  `buildOffsetQuerySchema`, `defineSortConfig`, os `meta`); ficou em `lib/pagination.ts` o que
  traduz isso em banco (`skip`/`take`, `orderBy` com tiebreaker, cursor, envelopes).
- `resolveSlug` (usa `slugify` e lança o 422) ficou em `catalog.slug.ts`; `slugSchema`,
  `catalogNameSchema` e `catalogDescriptionSchema` migraram.
- O teto do token opaco (`OPAQUE_TOKEN_LENGTH`) virou constante do contrato, porque é o `.max()`
  dos campos `token`; a entropia (`OPAQUE_TOKEN_BYTES`) continua da API, em `lib/token.ts`, e
  um teste unitário prova que o gerador emite exatamente o comprimento do contrato — a revisão
  derrubou a versão em que os bytes eram derivados do contrato, porque isso deixava o contrato
  ditar a entropia (e um teto ímpar viraria `randomBytes(31.5)`).
- `MAX_IMAGES_PER_PRODUCT` mora ao lado do schema de reordenação que ele limita; a taxonomia de
  auditoria (`AUDIT_ACTIONS`, `AUDIT_TARGET_TYPES`) é o que `?action=`/`?targetType=` aceitam e
  migrou inteira — `lib/auditLog.ts` tipa o descritor a partir dela.
- `role.constants.ts` e `feature.constants.ts` deixaram de reexportar: quem precisa de
  `RoleName`, `FeatureName`, `PRIVILEGED_FEATURES` etc. importa do contrato; os dois arquivos
  guardam só o que o seed anexa a cada nome.

O `openapi.json` gerado saiu **byte a byte idêntico** ao anterior em cada commit da migração
(o `.meta()` viajou junto), a suíte de `mass-assignment` e os testes de schema passaram sem
alteração, e os testes unitários dos schemas que migraram (paginação, `targetType` do audit)
migraram para `packages/api-contracts/tests/`. Dentro do pacote, enums e nomes vivem em arquivos
folha (`user.enums.ts`, `role.names.ts`, `pet.enums.ts`, `pagination.schema.ts`, …) e todo import
entre domínios aponta para a folha, nunca para o índice — é o que impede um ciclo
`user → role → user` de virar TDZ.
