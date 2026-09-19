# 10: `api-contracts` — migração dos schemas e views

**What to build:** todo schema de request (create, update, query, path) e toda view de
resposta da API vivem no contrato, e a API os **importa de lá** — controllers, presenters e
testes. Os arquivos de schema antigos são apagados ("contract" do refactor largo). O helper que
faz `.parse()` por whitelist fica na API; só os schemas Zod migram. A suíte da API é o oráculo:
nenhum comportamento muda.

**Blocked by:** 09.

**Status:** fechada em 2026-09-18

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] Migração **módulo a módulo**, um commit por módulo, com `typecheck` + `lint` dos dois
      pacotes, os testes do módulo e o `openapi.json` comparado byte a byte entre um e outro:
      paginação (pré-requisito), user + perfis + `me`, auth, role, feature, permission,
      pet + breed, catálogo compartilhado + brand, category, tag, product/variant/image (a busca
      é o `?q=` de `listProductsSchema`), audit log, log, shape de erro no `docs/components.ts`,
      e por fim a queda dos reexports de `*.constants.ts`.
- [x] Resolvido no lugar: enum do Prisma → enum do contrato (`petSpeciesSchema`,
      `petSexSchema`, `productStatusSchema`, `profileKindSchema`, `userStatusSchema`); da
      paginação migraram os schemas de query, `defineSortConfig`/`buildOffsetQuerySchema` e os
      `meta` (`@pet-oasis/api-contracts/pagination`), e `lib/pagination.ts` ficou só com o que
      toca o repository (`skip`/`take`, `buildOrderBy`, cursor, envelopes); `resolveSlug` ficou
      na API como `catalog.slug.ts` (usa `slugify` e a factory de erro); o teto do token opaco
      virou `OPAQUE_TOKEN_LENGTH` no contrato e `lib/token.ts` deriva os bytes dele;
      `MAX_IMAGES_PER_PRODUCT` mora ao lado do schema de reordenação (o
      `product.image.constants.ts` sumiu); a taxonomia de auditoria (`AUDIT_ACTIONS`,
      `AUDIT_TARGET_TYPES`) migrou inteira (o `lib/auditLog.constants.ts` sumiu) — é o que o
      filtro aceita e o que a linha carrega.
- [x] `.max()`, `.strict()`, `z.never` e as peças de identidade chegaram intactos: a suíte de
      `mass-assignment` e os testes de schema passaram sem alteração. Os testes unitários dos
      schemas que migraram (`pagination`, `targetType` do audit) migraram junto para
      `packages/api-contracts/tests/` — o pacote saiu de 10 para 32 testes, a API de 1301 para
      1279 (a diferença são exatamente os 22 que mudaram de casa).
- [x] Todo `*.presenter.ts` da API virou `createPresenter(<views do contrato>)`; `maskIp` ficou
      no presenter do audit log; `resolveUserView` e `readViewFor` continuam na API. Os tipos de
      nome de view (`UserView`, `ProductView`, `VariantView`, …) saíram junto com as views.
- [x] Nenhum `*.schema.ts` sobrou em `apps/api/src/modules/`; os schemas de view dos
      `*.presenter.ts` foram embora; `role.constants.ts` e `feature.constants.ts` deixaram de
      reexportar (não eram só reexport: guardam o seed — o que se apagou foi a linha
      `export { … }`, e todo importador de `RoleName`/`FeatureName`/`PRIVILEGED_FEATURES` etc.
      aponta para o contrato).
- [x] `openapi.json` **idêntico** (313 988 bytes, `cmp` limpo) em cada um dos 15 commits — os
      `.meta()` migraram junto, e `docs/components.ts` passou a importar `errorResponseSchema` e
      `validationErrorResponseSchema` do contrato em vez de redefini-los.
- [x] Pureza e paridade verdes; nenhum `@prisma`/`@/` no pacote. Dentro do pacote, enums e
      nomes foram para arquivos folha (`user.enums.ts`, `role.names.ts`, `pet.enums.ts`,
      `catalog.enums.ts`, `feature.names.ts`) e todo import entre domínios aponta para a folha —
      sem isso `user.schema → role/index → role.views → user/index → user.schema` seria TDZ.
      Entradas novas no `exports`: `/auth`, `/me`, `/permission`, `/audit-log`, `/log`,
      `/pagination`.
- [x] Suíte completa da API (1279) + do pacote (32) + `typecheck` + `lint` + `docs:check`
      verdes; Docker `build` da API verde nos três estágios (o `runtime` tem o pacote
      materializado pelo `pnpm deploy` e o `dist/server.js` sem import dele). O stack de `dev`
      subiu pelo Compose real (projeto e portas isolados, porque o `pet-oasis-dev` do checkout
      principal estava em uso) e respondeu `/status` 200 e 422 do contrato em `?sort=`. O boot
      de produção foi provado pela imagem `runtime` com o próprio entrypoint (`migrate deploy`
      + seed + server) contra Postgres/Redis isolados — `prod:up` literal não sobe nesta
      máquina por falta da rede externa `pet-oasis`, que é pré-requisito do host, não da
      migração.
- [x] Documentação: `docs/context/api-contracts.md` ganhou "Onde o contrato vive" (11.10),
      indexada em `docs/context.md`; `architecture.md` (11.9) narra o "contract" do refactor;
      `CLAUDE.md` da API (organização de módulos, não-escalação, peças de identidade),
      `docs/guides/documenting-endpoints.md`, `security.md` e `infrastructure.md` dizem onde o
      schema vive agora; README e `description` do pacote listam as entradas novas.
