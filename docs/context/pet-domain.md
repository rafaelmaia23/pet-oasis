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
- **O que a 9.3 firmou** (§ "O que a implementação (9.3) firmou além da decisão" do mesmo ADR):
  só `DOG` e `CAT` em `SPECIES_WITH_BREED` — ave e roedor têm variedade, não raça; contrato do
  `GET /breeds` (público, `?species=` opcional, sem paginação); `Breed` é dado de **referência**
  (sobrevive ao `clearDatabase` e ao `demo-reset`); a constante mora em
  `src/modules/breed/breed.constants.ts` e não em `src/lib/seed/`; e o seed usa `createMany` com
  `skipDuplicates`, **sem** delete reconciliador — apagar raça com pet quebraria o boot
- **O que a 9.4 firmou** (§ "O que a implementação (9.4) firmou além da decisão" do mesmo ADR):
  `microchipId` com `@unique` **global** (U1, precedente de email/cpf/phone — o chip preso por um
  pet excluído é o sinal certo num identificador do mundo real); pets **cascateiam e voltam por
  correlação de data** (U2 — ver [lifecycle.md](lifecycle.md#pet-é-o-primeiro-filho-de-domínio-do-grafo-94));
  falecimento em **rota própria** e idempotente (U3); `species` editável, com a raça revalidada
  sobre o estado resultante (U4); e o alvo inexistente **falhando fechado** em 403 quando o ator
  não tem `:others` (U5)
- **O que a 9.5 firmou** (§ "O que a implementação (9.5) firmou além da decisão" do mesmo ADR):
  `GET /pets`, a listagem de balcão, traz vivos **e** falecidos por default — `?deceased=` é o
  recorte, não o default, para que `meta.total` não minta (V1); allowlist de filtros com
  `customerId`/`breedId` funcionando como **filtro e não resolução de recurso** (uuid inexistente
  → lista vazia, nunca 404) e `microchipId` como busca exata de balcão (V2); allowlist de
  ordenação `createdAt`/`name`/`species`, com `birthDate` recusado por ser anulável e estimável
  (V3). Duas assimetrias deliberadas: só `GET /pets` pagina (a coleção do dono continua com
  `meta {}`) e só ela exige `read:pet:others` direto na rota

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

**Taxonomia, firmado na implementação (9.6)** — § "O que a implementação (9.6) firmou além da
decisão" do mesmo ADR:

- **Árvore de no máximo 3 níveis** (W1), validada no service por funções puras sobre uma leitura
  única de todas as categorias ativas — não uma query por nível
- Produto vincula a **qualquer nó**, folha ou não (W2) — o preço é herdado pela 9.8: "produtos de X"
  vira a união de X com os descendentes
- Excluir categoria com filha ativa **ou com produto ativo vinculado** é **409** (W3, completado na
  9.7) — sem cascata e sem reparenting; desvincular violaria o mínimo-de-uma-categoria por produto
- **Slug derivado do nome e congelado** (W4) — renomear não muda a URL pública; o `slug` explícito é
  aceito no corpo e vence o derivado
- **`Tag` é hard delete** (W5) — a única tabela de domínio do projeto sem `deletedAt`
- **`name`/`slug` unique global** (W6), o índice ignora `deletedAt` — recriar linha excluída é 409,
  no precedente de `Pet.microchipId`
- **Nenhuma das três leituras pagina** (W7) — `GET /categories` devolve a árvore aninhada, as outras
  duas a lista completa; as três com `meta {}`

**Produto e variante, firmado na implementação (9.7)** — § "O que a implementação (9.7) firmou além
da decisão" do mesmo ADR:

- **`sku` unique global** (X1), valendo para a variante excluída — precedente de `Pet.microchipId` e
  do W6; duplicata é 409 pelo P2002, sem código novo
- **Estoque não fica negativo** (X2) — sem carrinho não há caminho legítimo para isso; a Fase 10
  reabre a pergunta com reserva e venda
- **`POST /products` exige `variants[]` com min 1** (X3), tudo numa transação — o invariante nunca é
  observável violado
- **Feature por campo presente no `PATCH /variants/:id`** (X4): `stockQuantity` é `manage:stock`, o
  resto é `manage:product`, corpo misto exige as duas — o repositor conta prateleira sem editar o
  catálogo, com uma rota só
- **Exatamente uma variante default** (X5), garantida pelo service nas três escritas; excluir a
  última variante ativa é **409** (X6)
- **`categories[]`/`tags[]` são substituição total** no corpo do produto (X7), categoria com mínimo
  de um; id inexistente ou excluído é 422 nomeando o campo
- **Exclusão do produto cascateia nas variantes** com um `new Date()` único (X8), no idioma do grafo
  do usuário; os vínculos ficam, porque aresta não é filho
- `ProductImage` fica para a 9.10 (X9) · `description` obrigatória com teto próprio de 2000 e
  `label` da variante informado pelo staff (X10)

**Leitura do catálogo, firmado na implementação (9.8)** — § "O que a implementação (9.8) firmou além
da decisão" do mesmo ADR:

- **`?status=` é ignorado em silêncio** para quem não vê o interno (Y1) — 422 ou 403 confirmariam
  que existe um estado escondido, e a mensagem de erro *é* a resposta
- **`GET /products/:idOrSlug` é uma rota só** (Y2), UUID → id e resto → slug; a ambiguidade morre na
  **escrita**, com o `slugSchema` compartilhado recusando slug com forma de UUID
- **`?sort=price` é o menor preço entre as variantes ativas** (Y3) — o único candidato coerente com
  a faixa de preço, que já olhava todas as variantes. Custo técnico: o Prisma não ordena relação por
  agregado, então a listagem por preço é um segundo caminho no repository (`groupBy` de ids +
  hidratação), sem SQL cru
- **`inStock` derivado na variante e no produto** (Y4), presente em **todas** as views (Y10) —
  inclusive nas respostas de escrita da 9.7
- **`?species=X` casa também com `targetSpecies: []`** (Y5) — vazio é "qualquer espécie", e o
  comedouro universal não some da seção de cães
- **`?tag=` repetível é interseção** (Y6) · ordenação default `createdAt` desc, allowlist `price`,
  `name`, `createdAt` (Y7)
- **Produto fora do conjunto visível é 404**, não 403 (Y8) — "403 vence 404" vale para rota
  autenticada; aqui a rota é pública e o 403 confirmaria o slug do rascunho
- **`read:product:cost` implica a visão interna** (Y9) — três views em escada (`public` →
  `internal` → `cost`), com o predicado `canSeeInternal` escrito **uma vez** e usado tanto no `where`
  quanto na escolha da view, para lista e resposta nunca discordarem

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

O **kickoff da 9.9** (adendo no mesmo ADR, Z1–Z17) fechou as duas armadilhas que tinham ficado em
aberto e trocou a estratégia de consulta que o ADR previa:

- **Erro de digitação é corrigido na query, não compensado no ranking** (Z5) — mantém-se a lista de
  lexemas que existem no catálogo e cada palavra ausente é trocada pela mais parecida **antes** de
  virar `tsquery`. As duas saídas previstas (fallback no vazio, pontuação combinada) falhavam no
  mesmo ponto: uma query com uma palavra certa e uma errada. O ranking continua `ts_rank` puro.
  **A implementação tornou a correção condicional:** a busca literal roda primeiro e a reescrita só
  entra quando ela volta vazia — corrigir sempre escondia produto novo, cuja palavra o dicionário
  (derivado, defasado) ainda não conhece.
- **O SQL cru só ranqueia** (Z4) — devolve `(id, rank)`, e quem decide o que é visível continua
  sendo o `buildProductWhere`. Uma query crua completa daria `total` exato, ao custo de uma segunda
  definição de "produto visível" — o vazamento que a Y8 fechou, por outra porta.
- **O corpus para onde a coluna gerada alcança** (Z1) — produto (nome peso A, descrição peso C) e
  marca, em duas colunas geradas; tag fica de fora porque é N:N e exigiria trigger para não ficar
  stale, duplicando um filtro (`?tag=`) que já existe.
- **O dicionário só conhece o catálogo público** (Z17) — porque a resposta expõe a correção
  aplicada (`meta.search`, Z15), e um dicionário completo deixaria sondar rascunho palavra a
  palavra.

## Upload de imagem — [`adr/file-storage-and-uploads.md`](../adr/file-storage-and-uploads.md)

Disco local atrás de um adaptador (`put`/`delete`/`url`, implementação `LocalDiskStorage`), servido
como estático pelo reverse proxy. Inclui o cuidado com o ambiente demo (role `demo` sem escrita,
`demo-reset` limpando o diretório, rate limit e teto de tamanho próprios).

## Paginação do catálogo — [`adr/pagination.md`](../adr/pagination.md)

Adendo da Fase 9: ordenação configurável (`?sort=`) sai do backlog e entra **só no offset**; a
limitação do cursor permanece documentada.
