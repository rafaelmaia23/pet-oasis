# Context Map

O Pet Oasis é um sistema com mais de um contexto: cada app do monorepo é um contexto, com o
próprio glossário (`CONTEXT.md`, formato da skill `domain-modeling`) e os próprios ADRs
(`docs/adr/`, índice em `README.md`). Decisões que atravessam contextos vivem em
[`docs/adr/`](./docs/adr/) da raiz.

## Contexts

- **API** ([`apps/api/CONTEXT.md`](./apps/api/CONTEXT.md)): o domínio do pet shop — usuários e
  perfis, autorização, sessões, pets e catálogo (produto, variante, marca, categoria, tag,
  imagem). Dona dos dados e das regras de negócio. O glossário diz *o que* cada termo é; o
  *porquê* está nos ADRs da API (índice em
  [`apps/api/docs/adr/README.md`](./apps/api/docs/adr/README.md)).
- **Web** ([`apps/web/CONTEXT.md`](./apps/web/CONTEXT.md)): a vitrine, a área do cliente e o
  back-office, renderizados no servidor e falando com a API por BFF. Não tem dado próprio. O
  *porquê* está nos ADRs do web (índice em
  [`apps/web/docs/adr/README.md`](./apps/web/docs/adr/README.md)).

## Relationships

- **Web → API**: o web consome a API por HTTP, sempre pelo servidor dele (BFF) — o navegador do
  visitante nunca fala com a API direto. A identidade do visitante chega à API por
  `X-Forwarded-For`, e a sessão vive num cookie do web.
- **API ↔ Web (contrato)**: os schemas Zod que atravessam a rede — request, views de resposta,
  enums de domínio, nomes de role e feature, shape de erro — e a **tabela de rotas**
  (`routes.<domínio>.<operação>`: método, path, request, resposta e erro por status, exigência
  de auth) são um pacote compartilhado, `packages/api-contracts`, dependendo só de `zod`. A API
  o consome nos próprios controllers e presenters, e o `/openapi.json` dela é **derivado** da
  tabela de rotas; o web (e qualquer cliente futuro) o importa. O vocabulário desses tipos é o
  do contexto **API**: o contrato não cria termo, só o exporta. O porquê está em
  [`docs/adr/0003`](./docs/adr/0003-route-table-is-contract-openapi-is-derived.md).
