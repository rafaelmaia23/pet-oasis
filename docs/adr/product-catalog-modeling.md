# Modelagem do catálogo: produto, variante, categoria e espécie

> Decisão de domínio registrada no planejamento da Fase 9 (sub-fases 9.6, 9.7,
> 9.8). Introduz o segundo bloco de recursos de domínio do projeto. A decisão
> de produto×variante condiciona diretamente o formato de `OrderItem` na Fase
> 10 (ver `docs/adr/product-vs-service.md`).

## O problema

Um pet shop vende produto com variação real: "Ração Golden Adulto" existe em
1 kg, 10,1 kg e 15 kg — preço, estoque e código de barras diferentes, mas mesma
descrição, mesma marca, mesma categoria. Modelar isso errado (produto plano,
uma linha por tamanho) é caro de desfazer depois, porque o item do pedido da
Fase 10 herdaria o erro.

Um segundo problema, levantado pelo usuário durante o planejamento: uma cama de
pet serve cães e gatos. Isso é duas categorias ("Cães > Camas" e "Gatos >
Camas") ou uma? A resposta errada faz a árvore de categorias crescer como um
produto cartesiano a cada espécie nova.

## Decisão ✅

### `Product` + `ProductVariant`

```prisma
model Product {
  id            String         @id @default(uuid())
  name          String
  slug          String         @unique
  brandId       String
  status        ProductStatus  @default(DRAFT)
  targetSpecies PetSpecies[]
  brand         Brand          @relation(fields: [brandId], references: [id])
  categories    ProductCategory[]
  tags          ProductTag[]
  variants      ProductVariant[]
  images        ProductImage[]
}

model ProductVariant {
  id            String   @id @default(uuid())
  productId     String
  sku           String   @unique
  priceCents    Int
  costCents     Int?
  stockQuantity Int      @default(0)
  isDefault     Boolean  @default(false)
  weightGrams   Int?
  volumeMl      Int?
  sizeLabel     String?
}
```

`Product` é a identidade comercial (nome, descrição, marca, categorias, tags,
espécies-alvo, status, imagens). `ProductVariant` é a unidade vendável (SKU,
preço, custo, estoque, e o que varia — peso do pacote, volume, tamanho).

Produto plano (cada peso como produto independente) foi recusado: a vitrine
mostraria três cards do mesmo produto, "escolher o tamanho" deixaria de existir
como conceito, e `OrderItem` (Fase 10) apontaria para algo que não é a unidade
real de venda. **Consequência para a Fase 10:** `OrderItem` aponta sempre para
`ProductVariant`, nunca para `Product`.

**Todo produto tem pelo menos uma variante.** Um produto "sem variação" ganha
uma variante única, marcada `isDefault`. Isso evita o caminho duplo "produto
com preço próprio × produto com variantes", que é a fonte clássica de bug em
catálogo — só existe um lugar onde preço/estoque moram.

### Categoria é função do produto; espécie é uma faceta própria

```prisma
model Category {
  id       String     @id @default(uuid())
  name     String
  slug     String     @unique
  parentId String?
  position Int        @default(0)
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
}
```

Categoria, em árvore, modela **função**: `Alimentação > Ração seca`,
`Conforto > Camas`, `Higiene > Tapetes`. Espécie é uma **faceta** própria,
coluna array no produto (`Product.targetSpecies: PetSpecies[]`), fora da
árvore.

"Cães > Camas" e "Gatos > Camas" não são categorias diferentes — são a mesma
categoria funcional vista por duas espécies. Modelá-las como duas faria
**toda** categoria folha se duplicar por espécie, e a árvore viraria um
produto cartesiano que cresce a cada espécie nova. Separando as dimensões, a
cama que serve aos dois é **uma linha** com `targetSpecies: [DOG, CAT]`. Na
navegação, o menu "Cães" é `?species=DOG`; o breadcrumb "Cães > Camas" é
`?species=DOG&category=camas` — a árvore fica pequena e estável, e a
combinatória fica no filtro, onde é barata.

Implementado como `PetSpecies[]` no Postgres (Prisma expõe `has`/`hasSome`),
com índice GIN. Array vazio significa "serve a qualquer espécie" — evita listar
todas as espécies num produto genérico e não quebra quando uma espécie nova
entra no enum.

Categoria é N:N (`ProductCategory`) com **mínimo de uma** por produto — mesmo
com a espécie fora da árvore, sobra caso legítimo de dupla pertinência
funcional (tapete higiênico é higiene e é adestramento). Tag também é N:N
(`ProductTag`), **sem** mínimo, para o transversal e volátil: "promoção",
"hipoalergênico", "filhote", "lançamento".

### Características da variante são colunas fixas

`weightGrams`, `volumeMl`, `sizeLabel` — não EAV (`Attribute`+
`ProductAttribute`), não JSON.

EAV dá flexibilidade cadastrável pelo funcionário ao custo de filtro sofrível,
tipagem impossível e junções em tudo — contra o valor central do projeto, que é
tipagem estrita. JSON é meio-termo que funciona no Postgres mas sai do
conforto do Prisma e do Zod, e permite que o dado se suje sem que nada
reclame. Colunas fixas cobrem a esmagadora maioria dos casos de pet shop com
uma fração da complexidade; atributo novo é migration — barata e explícita.
Tags absorvem o resto.

### Preço em centavos

`priceCents`, `compareAtPriceCents`, `costCents` — inteiro, nunca `Decimal`.
Elimina de uma vez a classe de bug de ponto flutuante, é o formato que
gateways de pagamento usam, e evita o `Decimal` do Prisma, que chega como
objeto e contamina serialização/Zod/comparação. Moeda fica implícita (BRL) até
existir motivo para uma coluna.

O congelamento de preço é assunto da Fase 10, mas a regra já está firmada
aqui: o item do pedido **grava** o preço no momento da compra e nunca lê do
produto. `costCents` é dado interno — nunca aparece na view do cliente (ver
views por capability, abaixo).

### Status do produto coexiste com soft delete

```prisma
enum ProductStatus { DRAFT ACTIVE DISCONTINUED }
```

`deletedAt` continua sendo o soft delete de sempre (erro de cadastro,
duplicata). Um produto `DISCONTINUED` **não** está excluído: tem histórico de
venda e pode voltar. Os dois conceitos respondem perguntas diferentes — "isto
está à venda?" e "isto existe?" — e coexistem por isso.

### Marca como entidade

`Brand` é entidade própria, não string livre. Pet shop é um domínio onde marca
vende — o cliente busca "Golden", "Royal Canin", "Whiskas" pelo nome. Entidade
dá filtro confiável, página de marca no futuro, logo próprio, e evita a
grafia divergente que string livre garante.

### Views por capability

O presenter por whitelist Zod, já usado no módulo de usuário, resolve
"cliente não vê custo/estoque interno" sem risco de vazamento:

| Campo | Cliente / público | Funcionário |
|---|---|---|
| preço, nome, descrição, imagens, marca, categorias, tags | ✅ | ✅ |
| `costCents`, margem | ❌ | ✅ |
| `stockQuantity` exato | ❌ | ✅ |
| disponibilidade (booleano derivado do estoque) | ✅ | ✅ |
| produtos `DRAFT` e `DISCONTINUED` | ❌ | ✅ |

Expor **disponibilidade** em vez de quantidade exata para o público é decisão
consciente: quantidade exata é informação competitiva e não muda nada para
quem compra. Um teste de contrato afirma que a view pública não contém
`costCents` nem `stockQuantity`.

Imagem pertence ao **produto**, não à variante — imagem por variante é caso
real ("cores diferentes" precisa; "mesmo saco, tamanhos diferentes" quase
nunca precisa) mas adiciona complexidade que o domínio raramente cobra
(`docs/backlog.md`).

## Alternativas consideradas

- **Produto plano** (cada variação como produto independente): ver acima.
  Preterido.
- **Espécie como nível da árvore de categoria:** produto cartesiano que cresce
  a cada espécie nova. Preterido.
- **Características via EAV:** filtro sofrível, tipagem impossível, junções
  em tudo. Preterido.
- **Características via JSON:** sai do conforto do Prisma/Zod, dado se suja
  sem alarme. Preterido.
- **Preço como `Decimal`/float:** classe de bug de arredondamento e objeto que
  contamina serialização. Preterido.
- **Marca como string livre no produto:** grafia divergente, sem filtro
  confiável. Preterido.

## Quando revisitar

- Se a Fase 10 (pedido) mostrar que `OrderItem` precisa de algo que
  `ProductVariant` não carrega: revisar aqui antes de remendar lá.
- Se imagem por variante virar necessidade real (ex.: cores): sair do backlog.
- Se características fixas pararem de cobrir o catálogo (produto muito
  heterogêneo): reconsiderar EAV/JSON com dado real de volume, não hipotético.
