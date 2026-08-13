# Domínio pet shop (Ciclo 2) — índice de decisões

> **Este arquivo é quase todo ponteiro.** As decisões do Ciclo 2 nasceram já com ADR próprio, e o
> ADR é o dono do texto — duplicá-las aqui só criaria duas versões que envelhecem em ritmos
> diferentes. O passo-a-passo está no [`todo.md`](../todo.md), a sessão de brainstorming que
> originou tudo em [`planning/fase-9-contexto.md`](../planning/fase-9-contexto.md), e o que ficou
> de fora com o racional de exclusão em [`reference/backlog.md`](../reference/backlog.md).

---

## O recorte da Fase 9 (a única decisão que não tem ADR)

**Bloco A (pets) + Bloco B (catálogo), sem checkout.** Dos três recortes avaliados, "só pets"
ficava magro demais para o marco que o README anuncia ("o Ciclo 2 abre o domínio do pet shop"), e
"loja virtual completa" (pets + catálogo + carrinho + pedido) foi recusado porque o pedido depende
de estoque, que depende de variante, que depende de preço — uma cadeia longa demais para descobrir
um erro de modelagem só no fim. As duas agregações entregues se tocam **apenas** na faceta "para
qual espécie este produto serve", o que permite trabalhá-las em sequência sem que uma trave a
outra. Carrinho, pedido e pagamento ficam para a Fase 10.

---

## Pets — [`adr/pet-domain-modeling.md`](../adr/pet-domain-modeling.md)

- Espécie como **enum fechado sem `OUTRO`** — por que a lista nasce mais larga que o mínimo e por
  que `OUTRO` é buraco permanente, não flexibilidade
- Raça como **tabela semeada por constante, nunca API em runtime** (TheDogAPI/TheCatAPI
  descartadas: disponibilidade refém de terceiro, sem id estável para FK, cobertura ruim fora de
  cão e gato)
- `SPECIES_WITH_BREED` é constante **explícita**, não derivada do dado — derivar faria pets já
  cadastrados violarem a regra retroativamente
- **Dono único** (`Pet.customerId` obrigatório, sem N:N), com o gatilho de revisão registrado
- **Falecimento é estado, não exclusão** (`deceasedAt` separado de `deletedAt`)
- Peso é instantâneo, não histórico · `birthDateIsEstimated`

## Catálogo — [`adr/product-catalog-modeling.md`](../adr/product-catalog-modeling.md)

- `Product` + `ProductVariant`, **nunca produto plano** — todo produto nasce com ≥1 variante para
  não abrir dois caminhos de preço
- **Categoria é função, espécie é faceta** ("o problema da cama") — por que a árvore não se
  duplica por espécie e por que array vazio significa "serve a qualquer espécie"
- Características da variante em **colunas fixas**, não EAV nem JSON
- **Preço em centavos** (e por que não `Decimal`)
- Status do produto (`DRAFT/ACTIVE/DISCONTINUED`) **coexiste** com soft delete — respondem
  perguntas diferentes
- Marca como entidade · views por capability (custo e estoque interno fora da view do cliente;
  público vê **disponibilidade**, não quantidade)

## Produto × serviço — [`adr/product-vs-service.md`](../adr/product-vs-service.md)

Decisão tomada agora, **herdada pela Fase 10**: tabelas separadas + `OrderItem` polimórfico com
CHECK constraint escrito à mão. Registra por que `kind` único e supertipo com PK compartilhada
foram preteridos.

## Busca textual — [`adr/text-search.md`](../adr/text-search.md)

Postgres nativo (`tsvector` + `unaccent` + `pg_trgm`), decisão do usuário explicitamente contra a
recomendação inicial (que era começar com `ILIKE`), com motivação didática. Traz as armadilhas
documentadas para não custarem uma tarde cada (`unaccent` não é `IMMUTABLE`; `CREATE EXTENSION` em
migration à mão; sem índice GIN funciona e é lento; `websearch_to_tsquery` sobre `to_tsquery`;
limiar do `pg_trgm` é sessão-scoped e com pool precisa ser definido por query). O SQL cru fica
**só no repository** — ver [architecture.md](architecture.md#sql-cru-vive-exclusivamente-no-repository).

## Upload de imagem — [`adr/file-storage-and-uploads.md`](../adr/file-storage-and-uploads.md)

Disco local atrás de um adaptador (`put`/`delete`/`url`, implementação `LocalDiskStorage`), servido
como estático pelo reverse proxy. Inclui o cuidado com o ambiente demo (role `demo` sem escrita,
`demo-reset` limpando o diretório, rate limit e teto de tamanho próprios).

## Paginação do catálogo — [`adr/pagination.md`](../adr/pagination.md)

Adendo da Fase 9: ordenação configurável (`?sort=`) sai do backlog e entra **só no offset**; a
limitação do cursor permanece documentada.
