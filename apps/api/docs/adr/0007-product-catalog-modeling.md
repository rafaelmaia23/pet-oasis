# Modelagem do catálogo: produto, variante, categoria e espécie

> Decisão de domínio registrada no planejamento da Fase 9 (sub-fases 9.6, 9.7,
> 9.8). Introduz o segundo bloco de recursos de domínio do projeto. A decisão
> de produto×variante condiciona diretamente o formato de `OrderItem` na Fase
> 10 (ver `docs/adr/0008-product-vs-service.md`).

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
  description   String
  brandId       String
  status        ProductStatus  @default(DRAFT)
  targetSpecies PetSpecies[]
  brand         Brand          @relation(fields: [brandId], references: [id])
  categories    ProductCategory[]
  tags          ProductTag[]
  variants      ProductVariant[]
}

model ProductVariant {
  id            String   @id @default(uuid())
  productId     String
  sku           String   @unique
  label         String
  priceCents    Int
  compareAtPriceCents Int?
  costCents     Int?
  stockQuantity Int      @default(0)
  isDefault     Boolean  @default(false)
  weightGrams   Int?
  volumeMl      Int?
  sizeLabel     String?
  barcode       String?
}
```

`Product` é a identidade comercial (nome, descrição, marca, categorias, tags,
espécies-alvo, status, imagens). `ProductVariant` é a unidade vendável (SKU,
preço, custo, estoque, e o que varia — peso do pacote, volume, tamanho).

Os dois models e as duas junções nasceram na **9.7**, com soft delete e
timestamps em ambos. `ProductImage` não está acima porque é da **9.10**, junto do
adaptador de storage: nada na escrita do catálogo a referencia, e uma tabela com
FK é tão barata de criar depois quanto agora (X9).

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
  id          String     @id @default(uuid())
  name        String
  slug        String     @unique
  parentId    String?
  description String?
  position    Int        @default(0)
  deletedAt   DateTime?
  parent      Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children    Category[] @relation("CategoryTree")
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
views por feature efetiva, abaixo).

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

### Views por feature efetiva

O presenter por whitelist Zod, já usado no módulo de usuário, resolve
"cliente não vê custo/estoque interno" sem risco de vazamento:

| Campo | Cliente / público | Funcionário |
|---|---|---|
| preço, nome, descrição, imagens, marca, categorias, tags | ✅ | ✅ |
| `costCents`, margem | ❌ | ✅ |
| `stockQuantity` exato | ❌ | ✅ |
| disponibilidade (booleano derivado do estoque) | ✅ | ✅ |
| produtos `DRAFT` e `DISCONTINUED` | ❌ | ✅ |

> A implementação (9.8) transformou essas duas colunas numa **escada de três
> views** — `public` → `internal` → `cost` —, porque `read:product:cost` implica
> a visão interna (Y9). O campo `status` acabou do lado interno junto com o
> estoque, e a disponibilidade virou `inStock`, presente nas três (Y10).

Expor **disponibilidade** em vez de quantidade exata para o público é decisão
consciente: quantidade exata é informação competitiva e não muda nada para
quem compra. Um teste de contrato afirma que a view pública não contém
`costCents` nem `stockQuantity`.

Imagem pertence ao **produto**, não à variante — imagem por variante é caso
real ("cores diferentes" precisa; "mesmo saco, tamanhos diferentes" quase
nunca precisa) mas adiciona complexidade que o domínio raramente cobra
(`docs/reference/backlog.md`).

## O que a implementação (9.6) firmou além da decisão

A decisão original modelou a taxonomia mas não disse como ela se comporta. Sete
pontos foram fechados com o usuário na abertura da sub-fase 9.6 e valem daqui
para frente — inclusive para `Product` na 9.7, que reaplica W4 e W6.

**W1 — a árvore tem no máximo três níveis.** `Alimentação > Ração > Ração seca`
é o caso real mais fundo que o catálogo precisa; um teto conhecido é o que deixa
a navegação previsível e a consulta de subárvore com custo limitado. Sem limite,
a única regra seria "não faça ciclo", e a UI não teria como se preparar. O teto
não cabe no banco — nenhuma constraint expressa profundidade —, então vive no
service (`category.service.ts`), medido pelas funções puras de
`category.tree.ts` sobre a lista de todas as categorias ativas: **uma** leitura
por escrita, em vez de uma query por nível.

**W2 — produto vincula a qualquer nó, folha ou não.** Exigir folha criaria dois
problemas: todo produto genérico precisaria de uma folha "Outros" artificial, e
criar um filho numa categoria que já tem produtos tornaria o estado inválido de
repente. O preço é herdado pela **9.8**: "produtos de X" passa a ser a união dos
vinculados a X **mais** os dos descendentes, e a query de listagem precisa
cobrir os dois.

**W3 — excluir categoria com filha ativa ou produto vinculado é 409.** Sem
cascata (apagar um pai não pode sumir com uma subárvore inteira sem o staff
perceber) e sem reparenting silencioso (mudaria o significado de categorias que
ninguém tocou, e poderia estourar a profundidade em outro ramo). Desvincular
produtos em massa está fora de questão por um motivo mais forte: violaria o
mínimo de uma categoria por produto. A metade das filhas está implementada na
9.6; a dos produtos entrou na **9.7**, com `ProductCategory` (o vínculo de
produto **excluído** não segura nada — a contagem é só de ativos).

**W4 — slug derivado do nome na criação e congelado depois.** Renomear é a
mudança mais banal do catálogo, e deixá-la mexer na URL quebraria todo link
externo e a indexação. O `slug` explícito é aceito no corpo — no `POST` também,
não só no `PATCH` — e vence o derivado. `slugify` (`src/utils/slugify.ts`)
separa a letra do acento com `normalize("NFD")` e apaga só os diacríticos
combinantes, que é o que faz "Ração" virar `racao` e não `ra-c-ao`.

**W5 — `Tag` é hard delete.** Rótulo transversal e volátil não participa de
venda, então não há histórico a preservar, e o nome volta a ficar livre. Foi a
primeira tabela de domínio do projeto sem `deletedAt` (e sem `updatedAt`), no
idioma do `Breed` — a `ProductImage` (9.10) é a outra; o audit log passa a ser o único registro de que a tag
existiu, e por isso o descritor não é opcional no `deleteTag` do repositório.

**W6 — `name`/`slug` são unique global, o índice ignora `deletedAt`.**
Precedente de `User.email`, `Customer.phone` e `Pet.microchipId`: recriar uma
marca excluída sai 409 pelo handler de P2002, sem código novo, e o 409 é o sinal
correto ("isto já existiu aqui"), não um convite a duplicar. Índice parcial foi
recusado pelo mesmo motivo da 9.4. Consequência combinada com W4: duas
categorias homônimas em ramos diferentes colidem no slug — a saída é o `slug`
explícito, e é por isso que ele é aceito no `POST`.

**W7 — nenhuma das três leituras pagina.** `GET /categories` devolve a árvore
aninhada (cortá-la no meio devolveria filho sem pai); `GET /brands` e
`GET /tags` devolvem a lista completa ordenada por nome. As três com `meta {}`,
mesma classe de `/roles`, `/features` e `/breeds` — taxonomia é conjunto pequeno
e estável, e a vitrine monta o menu inteiro com uma chamada. O envelope existe
mesmo assim para que paginar amanhã seja aditivo, não breaking.

Duas consequências transversais nasceram junto e estão registradas fora daqui: o
middleware de **autenticação opcional** (`docs/adr/0097-optionalauthenticate-terceiro-modo-vitrine-publica.md`) e o **rate limit por IP** da vitrine
(`docs/reference/endpoints.md` § "Mounting").

## O que a implementação (9.7) firmou além da decisão

`Product` e `ProductVariant` estavam modelados, mas o comportamento da escrita
não. Dez pontos foram fechados com o usuário na abertura da sub-fase 9.7.

**X1 — `sku` é unique global**, valendo também para a variante soft-deletada.
Mesmo precedente de `Pet.microchipId` (U1) e de W6: duplicata sai 409 pelo
handler de P2002, sem código novo. O SKU de uma variante excluída fica preso, e
esse é o sinal correto ("este código já foi usado aqui"); reemitir é escolher
outro. Índice parcial (`WHERE deleted_at IS NULL`) foi recusado pela terceira
vez, pelo mesmo motivo: exigiria editar a migration à mão e daria ao projeto
duas gramáticas de unicidade.

**X2 — `stockQuantity` não pode ficar negativo** (422). Sem carrinho, o único
caminho de mudança é a edição manual do staff, e não existe caminho legítimo
para negativo — o que existe é erro de digitação do repositor, barrado na
entrada. A pergunta volta na Fase 10, onde reserva e venda dão a ela peso real.

**X3 — `POST /products` exige `variants[]` com mínimo 1**, criados na mesma
transação do produto e dos vínculos. O invariante "todo produto tem ≥1 variante"
nunca é observável violado, nem por um instante — diferente do caminho "cria o
produto, depois adiciona a variante", que deixaria produto invendável no banco e
obrigaria toda leitura a tolerar `variants: []`.

**X4 — a feature é exigida por campo presente no `PATCH /variants/:variantId`.**
`stockQuantity` pede `manage:stock`; qualquer outro campo pede `manage:product`;
corpo misto pede as duas. A rota admite as duas (`canAccess([...])`) e quem
separa é o service, no idioma do `pet.service`. É o que permite ao repositor
contar prateleira sem poder mexer no preço, com uma rota só. A lista de campos
de estoque é explícita (`STOCK_FIELDS`) porque a Fase 10 acrescenta reserva, e o
próximo campo não pode cair no lado errado em silêncio.

**X5 — exatamente uma variante default por produto**, garantida pelo service: a
primeira nasce default quando nenhuma vem marcada, promover outra rebaixa a
anterior na mesma transação, e excluir a default promove a mais antiga entre as
restantes. Duas marcadas no mesmo corpo é 422 (regra do schema — decide-se
olhando só o corpo), e `isDefault: false` não é aceito no `PATCH`: rebaixar sem
eleger outra deixaria a vitrine sem o que mostrar. Assim a 9.8 não precisa de
critério de desempate.

**X6 — excluir a última variante ativa é 409**, no idioma do W3. Tirar o produto
de circulação é `status: DISCONTINUED` (some da vitrine, preserva histórico) ou
`DELETE /products/:id`; nenhum dos dois é "apagar o último SKU". Cascatear o
produto a partir da variante foi recusado: seria uma exclusão que ninguém pediu.

**X7 — `categories[]`/`tags[]` são substituição total no corpo do produto.** O
array enviado passa a ser o conjunto; o campo ausente preserva os vínculos
atuais. Categoria exige mínimo 1 (vazio → 422), tag aceita vazio. Id inexistente
ou excluído → 422 nomeando o campo e listando os ids que sobraram. Sub-rotas de
vínculo (`POST /products/:id/categories/:id`) foram recusadas: quatro rotas a
mais e um cadastro de produto virando N chamadas.

**X8 — `DELETE /products/:id` cascateia nas variantes** com um único `new Date()`
na transação, como o grafo do usuário (D4): nunca existe filho ativo de pai
morto, e a igualdade do timestamp é a chave de correlação que um `restore` de
produto usaria. Os vínculos de categoria e tag **ficam**: são aresta, não filho
com ciclo de vida próprio, e quem filtra é o `deletedAt` do produto.

**X9 — `ProductImage` fica para a 9.10.** O precedente de nascer órfão
(`Pet.photoPath`, `Brand.logoPath`) existia para evitar uma migration de **uma
coluna**; uma tabela com FK é igualmente barata de criar depois, e nada na 9.7 a
referencia.

**X10 — `description` do produto é obrigatória, com teto próprio de 2000
caracteres** (os 500 do `catalogDescriptionSchema` servem ao rótulo de
categoria, não à página de produto), e **`label` da variante é obrigatório**,
informado pelo staff: derivar "15 kg" de `weightGrams: 15000` esconderia regra
de formatação (unidade, arredondamento, idioma) num lugar onde ninguém a
procuraria.

Três premissas seguiram decisão já firmada e não foram reabertas: `brandId` é
**obrigatório** (marca como entidade é o que dá filtro confiável — produto sem
marca reabriria a string livre por outra porta); o slug do produto reaplica W4 e
W6 literalmente, reusando `resolveSlug`/`slugSchema`; e a view da resposta de
escrita é escolhida pelo **ator** (`read:product:cost`), não pela rota — a view
pública, com disponibilidade derivada em vez de estoque exato, é da 9.8.

## O que a implementação (9.8) firmou além da decisão

A leitura era o lado que nunca tinha sido especificado: a decisão original tinha
a tabela de views, mas não *quem* resolve a view, nem o que acontece quando o
recorte e o filtro discordam. Dez pontos foram fechados com o usuário na abertura
da 9.8 — três deles eram pendências registradas desde o planejamento da fase.

**Y1 — `?status=` é ignorado em silêncio** para quem não tem
`read:product:internal` (era a pendência aberta na 9.1). As alternativas eram 422
(coerente com o filtro estrito de V2) e 403. As duas **confirmam** que existe um
estado escondido: a mensagem de erro é a resposta. A vitrine não pode contar isso
— e a incoerência com V2 é aparente, porque lá o valor é inválido e aqui o
parâmetro é *invisível*, que é caso diferente.

**Y2 — `GET /products/:idOrSlug` é uma rota só**, com a forma do valor
desempatando: UUID → id, resto → slug (era a pendência §9.5). A ambiguidade que a
pendência apontava é real, e não teórica — o regex de slug (hex minúsculo e
hífens simples) **casa** com um UUID. Ela foi fechada na **escrita**, não na
leitura: `slugSchema` passou a recusar slug com forma de UUID, e como o schema é
compartilhado, a garantia vale para marca, categoria e tag também. Fechar na
leitura seria impossível — um slug já gravado não teria como ser desempatado.

**Y3 — `?sort=price` é o menor preço entre as variantes ativas** (era a pendência
§9.6). É o "a partir de R$ X" que toda vitrine mostra, e é o único dos três
candidatos que casa com a faixa de preço já decidida (produto entra se **alguma**
variante couber): ordenar pela default deixaria um produto entrar na faixa e
ordenar fora dela. Consequência técnica: o Prisma só ordena relação por `_count`,
então a listagem por preço virou um segundo caminho no repository — `groupBy` de
variante para a página de **ids** já ordenada, `findMany` para hidratar, ordem
reimposta em memória (o `IN` do Postgres não a preserva). SQL cru foi recusado:
o projeto o reserva para a busca textual.

**Y4 — `inStock` aparece na variante e no produto.** Na variante é
`stockQuantity > 0`; no produto, "alguma variante ativa tem estoque". Os dois
níveis existem porque respondem a perguntas diferentes: o card da listagem quer
saber se vale mostrar o produto, e o seletor da página de detalhe quer saber qual
tamanho esgotou.

**Y5 — `?species=X` casa também com `targetSpecies: []`.** Vazio significa
"qualquer espécie" (N7), então o comedouro universal aparece na seção de cães sem
estar marcado. A alternativa (filtro literal) obrigaria o staff a marcar todas as
espécies em todo produto universal — e deixaria todos eles desatualizados no dia
em que uma espécie nova nascesse.

**Y6 — `?tag=` repetível é interseção**, não união: cada faceta marcada estreita
a lista, como em qualquer e-commerce. No `where` isso é um `some` por tag dentro
de um `AND`, e não um `in` — que daria união.

**Y7 — ordenação default `createdAt` desc**, o mesmo de `PET_SORT`. Allowlist:
`price`, `name`, `createdAt`; `relevance` entra na 9.9 com `?q=`.

**Y8 — produto fora do conjunto visível é 404**, com a mesma mensagem de
inexistente. A regra "403 vence 404" do projeto vale para rota **autenticada**,
onde negar já pressupõe identidade; aqui a rota é pública e não tem gate, então
403 apenas confirmaria o slug do rascunho para qualquer visitante. É a mesma
lógica de Y1, aplicada ao detalhe.

**Y9 — `read:product:cost` implica a visão interna.** As duas features podiam ser
tratadas como independentes, e isso exigiria uma quarta view (custo sem estoque)
para sustentar um cargo que não existe: na prática quem vê margem é gerente, e
gerente vê rascunho. A escada de três views (`public` → `internal` → `cost`)
mantém `internal` e `cost` exatamente como a 9.7 as deixou — só `public` nasceu.
O predicado é uma disjunção (`internal ∨ cost`) escrita **uma vez**
(`canSeeInternal`), usada tanto no `where` quanto na escolha da view: se os dois
divergissem, a resposta mostraria um campo do conjunto que a lista diz não ter.

**Y10 — `inStock` entra em todas as views**, inclusive nas respostas de escrita
da 9.7. É derivado e não é sensível, e tê-lo só na pública obrigaria o cliente a
ramificar por view para responder a pergunta mais banal do catálogo.

Dois pontos de contrato seguiram padrão já firmado e não foram reabertos: os três
filtros de taxonomia (`category`, `tag`, `brand`) são por **slug**, porque é a
chave que a URL da vitrine carrega e `?category=` já tinha sido decidido assim; e
slug de taxonomia inexistente é **filtro, não resolução** (V2) — devolve lista
vazia, nunca 404, para a listagem não virar oráculo de existência.

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

---

## Resumo e notas de execução (migrados do índice de contexto em 2026-09-18)

> Este bloco vivia no índice temático **Domínio pet shop** como resumo deste ADR e registro do que a
> implementação firmou além da decisão. Migrado sem edição; só os links foram reapontados.

- `Product` + `ProductVariant`, **nunca produto plano** — todo produto nasce com ≥1 variante para
  não abrir dois caminhos de preço
- **Categoria é função, espécie é faceta** ("o problema da cama") — por que a árvore não se
  duplica por espécie e por que array vazio significa "serve a qualquer espécie"
- Características da variante em **colunas fixas**, não EAV nem JSON
- **Preço em centavos** (e por que não `Decimal`)
- Status do produto (`DRAFT/ACTIVE/DISCONTINUED`) **coexiste** com soft delete — respondem
  perguntas diferentes
- Marca como entidade · views por feature efetiva (custo e estoque interno fora da view do cliente;
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
- **`Tag` é hard delete** (W5) — com a `ProductImage` (9.10), uma das duas tabelas de domínio
  sem `deletedAt`
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
