# ADRs de sistema — índice

> **Não leia este índice inteiro, e não leia todos os ADRs.** Ele é um roteador: ache a
> decisão de que você precisa e abra **só** o ADR dela. O protocolo é o mesmo da API e do web —
> mapa (`CONTEXT-MAP.md`) → glossário do app (`CONTEXT.md`) → índice → um ADR.
>
> Aqui ficam as decisões **de sistema**: a fronteira entre os apps, o que é contrato, o
> tooling do workspace, a infra que serve o todo e o modo de trabalho. Decisão que é de um app
> vive no `docs/adr/` dele — [API](../../apps/api/docs/adr/README.md) (numeração própria, quase
> duzentas) e [web](../../apps/web/docs/adr/README.md). Na dúvida: se mudar a decisão obriga a
> mexer em mais de um app, ou no repositório como um todo, ela é daqui.
>
> Cada arquivo é **uma decisão**, no formato da skill `domain-modeling`: título que é a
> decisão, contexto e porquê. A numeração é sequencial (`NNNN-slug.md`): ADR novo ganha o
> próximo número e entra na seção do tema dele.

---

## O monorepo

- [`0005`](0005-monorepo-in-place-pnpm-turborepo.md) O Pet Oasis é um monorepo, migrado
  in-place, com pnpm workspaces e Turborepo — o porquê do todo, a ordem das camadas, e o que
  ficou de fora com o gatilho para revisitar
- [`0006`](0006-one-source-for-node-pnpm-and-one-version-per-dependency.md) Node, pnpm e cada
  dependência compartilhada têm uma fonte só, na raiz — `engines` + `packageManager` +
  corepack, `allowBuilds`, e o `catalog:` com as duas exceções à regra "a mais nova"

## Infraestrutura do sistema

- [`0007`](0007-single-compose-stack-one-image-per-app.md) Um stack Compose para o sistema, e
  uma imagem por app construída da raiz — subir tudo ou um serviço é argumento, não arquivo

## A fronteira entre os apps

> O que atravessa a rede é o pacote `@pet-oasis/api-contracts`. A regra acionável está no
> [`CLAUDE.md`](../../CLAUDE.md) da raiz; o detalhe de cada fronteira, nos ADRs
> [`0198`](../../apps/api/docs/adr/0198-contrato-consumido-do-fonte-ts-so-depende-de-zod-enum-dois-donos.md)
> e [`0199`](../../apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md)
> da API, que são de lá porque descrevem o que a API faz com o contrato.

- [`0003`](0003-route-table-is-contract-openapi-is-derived.md) A tabela de rotas é contrato, e
  o `/openapi.json` é derivado dela
- [`0004`](0004-feature-names-cross-the-wire-as-enum.md) Nome de feature atravessa a rede como
  enum, não como string

## Modo de trabalho e documentação

- [`0001`](0001-domain-docs-follow-the-skill.md) A documentação de domínio segue a skill
  `domain-modeling` sem adaptação — `CONTEXT.md` é glossário puro, decisão com explicação é ADR
- [`0002`](0002-tracker-folders-are-phases.md) Cada pasta do tracker é um **esforço** de uma
  fase, nomeada `fase-<n>-<slug>` — a fase é capítulo do roadmap, o esforço é a unidade de
  branch e de entrega

---

## Como manter

ADR novo: próximo número, um arquivo, **e** a linha aqui na seção do tema — os dois no mesmo
commit, senão a decisão fica inalcançável. Decisão revertida é **reescrita** narrando a
reversão, nunca duplicada como decisão + errata. Depois, `pnpm docs:check` na raiz, que prova
que todo caminho e toda âncora citados existem.
