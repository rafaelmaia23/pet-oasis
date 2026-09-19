# Context Map

O Pet Oasis é um sistema com mais de um contexto: cada app do monorepo é um contexto, com o
próprio glossário (`CONTEXT.md`, formato da skill `domain-modeling`) e os próprios ADRs
(`docs/adr/`, índice em `README.md`). Decisões que atravessam contextos vivem em
[`docs/adr/`](./docs/adr/) da raiz.

## Contexts

- **API** (`apps/api/CONTEXT.md`): o domínio do pet shop — usuários e perfis, autorização,
  sessões, pets e catálogo (produto, variante, marca, categoria, tag, imagem). Dona dos dados e
  das regras de negócio. O arquivo ainda não existe — nasce na Fase 11 (issue 08) e o mapa já o nomeia; até lá, o vocabulário firmado
  está nas "regras de negócio já decididas" de `apps/api/CLAUDE.md`.
- **Web** (`apps/web/CONTEXT.md`, importado na Fase 11, issue 11): a vitrine e a área do cliente,
  renderizadas no servidor e falando com a API por BFF. Não tem dado próprio.

## Relationships

- **Web → API**: o web consome a API por HTTP, sempre pelo servidor dele (BFF) — o navegador do
  visitante nunca fala com a API direto. A identidade do visitante chega à API por
  `X-Forwarded-For`, e a sessão vive num cookie do web.
- **API ↔ Web (contrato)**: os schemas Zod que atravessam a rede — request, views de resposta,
  enums de domínio, nomes de role e feature, shape de erro — são um pacote compartilhado,
  `packages/api-contracts`, dependendo só de `zod`. A API o consome nos próprios controllers e
  presenters; o web (e qualquer cliente futuro) o importa. O vocabulário desses tipos é o do
  contexto **API**: o contrato não cria termo, só o exporta.
