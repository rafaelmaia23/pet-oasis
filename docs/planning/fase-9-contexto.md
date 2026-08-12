# Fase 9 — Domínio pet shop: pets e catálogo

> **Natureza deste documento:** é o resultado de uma sessão de definição de escopo com o
> usuário. Ele carrega o *quê*, o *porquê* e o *como* de cada decisão já tomada, e marca
> explicitamente o que **não** foi decidido. Não é um `todo.md` — é a entrada a partir da
> qual o `docs/todo.md` da fase, os ADRs e a atualização dos docs de referência devem ser
> escritos.
>
> Depois de consumido, este arquivo **não sobrevive**: seu conteúdo vira `docs/todo.md`
> (§ tarefas), `docs/context/pet-domain.md` (racional), ADRs (decisões estruturais) e
> `CLAUDE.md` (convenções). Apague-o ao final da fase, ou mantenha-o em
> `docs/planning/` como registro histórico — decisão do usuário.

---

## 0. Instruções para o Claude Code

1. **Leia o `CLAUDE.md` antes de qualquer coisa.** As regras dele valem integralmente
   aqui: nunca decidir regra de negócio sozinho, TDD sempre, branch por fase e por
   feature, commits em inglês e sem assinatura.
2. **A §9 deste documento lista as pendências que ainda não têm decisão.** Elas são regra
   de negócio. Pergunte ao usuário no momento da sub-fase correspondente, no formato
   habitual (2–4 caminhos, consequência de cada um, recomendação fundamentada, esperar a
   resposta). Não invente nenhuma delas.
3. **O que está decidido neste documento não se rediscute** sem o usuário levantar o
   assunto. Se durante a implementação uma decisão daqui se mostrar inviável, pare e
   apresente o conflito — não contorne silenciosamente.
4. **Ordem de trabalho:** primeiro escrever o `docs/todo.md` da fase (estrutura de
   sessões da §8), depois abrir a branch `fase-9`, depois começar pela sub-fase 9.1.
5. **Anotação para o futuro** segue a regra do `CLAUDE.md`: nota sobre uma sub-fase futura
   se escreve na seção *dela* no `todo.md`, criando o placeholder se não existir.

---

## 1. Escopo da fase

### 1.1 A decisão de recorte

Foram avaliados três recortes:

- **A — só pets.** Fiel ao que o roadmap prometia, mas magro demais para o marco que o
  README anuncia ("o Ciclo 2 abre o domínio do pet shop").
- **B — pets + catálogo, sem checkout.** ✅ **Escolhido.**
- **C — loja virtual completa (pets + catálogo + carrinho + pedido).** Recusado: o pedido
  depende de estoque, que depende de variante, que depende de preço — uma cadeia longa
  demais para descobrir um erro de modelagem só no fim.

**A Fase 9 entrega duas agregações praticamente independentes** (só se tocam na faceta
"para qual espécie este produto serve"), o que permite trabalhá-las em sequência sem que
uma trave a outra. Carrinho, pedido e fluxo de pagamento são a **Fase 10**.

### 1.2 O que a fase entrega

**Bloco A — Pets**
- Enum de espécies aceitas e tabela de raças semeada por constante.
- CRUD de pets ligados a `Customer`, com escopo `own` (o cliente cuida dos seus) e
  `:others` (funcionário cadastra e edita no nome de um cliente).
- Listagem geral de pets para staff, paginada e filtrável.
- Registro de falecimento como estado distinto de exclusão.

**Bloco B — Catálogo**
- Marca, categoria (em árvore) e tag como entidades próprias.
- `Product` + `ProductVariant` — o produto é a identidade comercial, a variante é o que
  tem SKU, preço e estoque.
- Catálogo navegável: listagem paginada, ordenável, filtrável por espécie, categoria,
  tag, marca e faixa de preço.
- Busca textual com tolerância a erro de digitação.
- Upload real de imagem, com armazenamento em disco atrás de um adaptador.
- Views distintas por capability do leitor (cliente não vê custo nem estoque interno).

**Transversal**
- Ordenação configurável nas listagens paginadas (dívida do `docs/reference/backlog.md`).
- Seed de dados fake do domínio, integrado ao reset do ambiente demo.
- Ações novas na taxonomia do audit log.
- RBAC do domínio: features e, possivelmente, roles novas de funcionário.

### 1.3 O que fica explicitamente fora

Carrinho · pedido · pagamento · frete · cupom e promoção · veterinária inteira (prontuário,
procedimentos, medicamentos, receitas) · serviços e agendamento (banho, tosa, consulta) ·
avaliações e comentários · lista de desejos · movimentação de estoque como entidade
(`StockMovement`) · reserva de estoque · notificação transacional · transferência de pet
entre clientes · frontend.

Tudo isso que tem valor reconhecido mas ficou fora deve entrar no `docs/reference/backlog.md` com o
racional (ver §7).

### 1.4 O que a fase consome do que já existe

| Já pronto | Como a Fase 9 usa |
|---|---|
| Helper de paginação offset+cursor (7.7) | Todas as listagens novas. Offset é o padrão; nenhuma lista desta fase é append-only ordenada por tempo, então cursor provavelmente não aparece. |
| Envelope `{data, meta}` | Contrato já firmado, vale para todas as listas novas sem exceção. |
| Soft delete com `deletedAt` | Padrão do projeto. Toda leitura filtra `deletedAt: null`. |
| RBAC com sufixo `:others` no `can()` | Escopo próprio × escopo de terceiros sai de graça. |
| Presenter por whitelist Zod | É o que resolve "cliente não vê custo/estoque" sem risco de vazamento. |
| Taxonomia fechada do audit log | Ganha ações novas, mantendo a política de metadata sem PII. |
| `src/lib/seed/` com constantes declarativas | `fakePets.constants.ts` já está previsto em comentário no `fakeUsers.constants.ts`. |
| Scripts agendados por systemd timer | O padrão para a varredura de arquivos órfãos do upload. |
| `demo-reset` com guarda `DEMO_MODE` | Precisa passar a limpar o diretório de upload. |

---

## 2. Bloco A — Pets

### 2.1 Espécies

**Decisão: enum no banco, sem valor `OUTRO`.**

Lista inicial, deliberadamente mais larga que o mínimo:

```
DOG · CAT · RABBIT · BIRD · RODENT · REPTILE · FISH
```

**Por que enum e não texto livre:** filtro confiável, relatório possível, dado que nasce
limpo. É a mesma escolha que o projeto já fez em `UserStatus` e `ProfileKind`.

**Por que sem `OUTRO`:** `OUTRO` parece flexibilidade e é um buraco permanente na
qualidade do dado — o pet fica sem raça válida, fora de todo filtro útil, e a pressão
seguinte é criar um `speciesOther` de texto livre, trazendo de volta pela porta dos fundos
exatamente o que o enum evitava. Adicionar valor a um enum no Postgres é
`ALTER TYPE ... ADD VALUE`, migration barata; quando aparecer uma espécie nova, ela nasce
com nome próprio e dado limpo. Erramos deliberadamente para o lado da lista maior.

### 2.2 Raças

**Decisão: tabela `Breed`, semeada a partir de uma constante versionada no repositório.**

O caminho de aquisição do dado é: puxar **uma vez** de uma API pública de raças
(TheDogAPI / TheCatAPI e equivalentes), curar o resultado à mão (nomes em pt-BR, remover
duplicata e ruído), commitar como constante em `src/lib/seed/`, e **nunca mais consultar a
API**. Manutenção dali em diante é edição da constante — raça de animal não muda com
frequência.

**Por que não consultar a API em runtime:** colocaria a disponibilidade da nossa API
refém de um terceiro (se ele cai ou nos rate-limita, o cadastro de pet quebra); não daria
id estável para usar como FK, empurrando `Pet.breed` de volta para string; e a cobertura é
ruim fora de cão e gato, em inglês.

**Estrutura:** `Breed` tem `id`, `name`, `species`, `@@unique([species, name])`. O seed é
idempotente por essa chave, no mesmo padrão de `DEFAULT_ROLES`/`DEFAULT_FEATURES`.

**Nem toda espécie tem raça cadastrada.** Cão e gato têm listas curadas; peixe e réptil,
não. A regra de "esta espécie exige raça?" vive numa **constante explícita**
(`SPECIES_WITH_BREED`) ao lado do enum — **não** é derivada de "existe linha em `Breed`
para esta espécie?".

> **Por que não derivar do dado:** parece mais elegante e é traiçoeiro. No dia em que
> alguém semear uma raça de peixe, todo pet-peixe já cadastrado passaria retroativamente a
> violar a regra "raça obrigatória", sem que ninguém tenha mudado a regra. Constante
> explícita é testável, previsível e não tem efeito retroativo.

**Consequências:**
- `Pet.breedId` é **nullable** no banco. A obrigatoriedade é **semântica**, no service:
  espécie em `SPECIES_WITH_BREED` exige `breedId`; espécie fora dela exige `breedId`
  ausente. Ambos os desvios são **422**, no mesmo shape de erro por campo que o projeto já
  usa — é o mesmo idioma da validação de `appliesTo` em roles.
- A raça informada **tem que pertencer à espécie informada** — validação semântica no
  service (precisa de banco), não no Zod do controller. 422.
- Espécies com raça precisam de uma linha **"SRD" (sem raça definida)** semeada, senão o
  vira-lata não tem o que selecionar.
- Nasce `GET /breeds?species=DOG` — leitura pública, para popular o select do frontend.

### 2.3 Modelo

```prisma
enum PetSpecies { DOG CAT RABBIT BIRD RODENT REPTILE FISH }
enum PetSex     { MALE FEMALE UNKNOWN }

model Breed {
  id        String     @id @default(uuid())
  name      String
  species   PetSpecies
  createdAt DateTime   @default(now()) @map("created_at")

  pets Pet[]

  @@unique([species, name])
  @@map("breeds")
}

model Pet {
  id          String     @id @default(uuid())
  customerId  String     @map("customer_id")
  name        String
  species     PetSpecies
  breedId     String?    @map("breed_id")
  sex         PetSex     @default(UNKNOWN)
  birthDate   DateTime?  @map("birth_date")
  birthDateIsEstimated Boolean @default(false) @map("birth_date_is_estimated")
  weightGrams Int?       @map("weight_grams")
  neutered    Boolean    @default(false)
  microchipId String?    @map("microchip_id")
  color       String?
  notes       String?
  photoPath   String?    @map("photo_path")
  deceasedAt  DateTime?  @map("deceased_at")
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")
  deletedAt   DateTime?  @map("deleted_at")

  customer Customer @relation(fields: [customerId], references: [id])
  breed    Breed?   @relation(fields: [breedId], references: [id])

  @@index([customerId])
  @@map("pets")
}
```

**Notas sobre campos específicos:**

- **`birthDateIsEstimated`** — caso real e frequente: pet adotado cuja idade o dono só
  estima. Sem esse booleano, ou você força uma data falsa sem marcá-la como tal, ou cria
  um campo `approximateAge` que duplica a informação em outra unidade. Um booleano ao lado
  da data resolve, e a idade continua sendo derivada de um campo só.
- **`weightGrams` como `Int`** — mesmo racional do preço em centavos: aritmética inteira,
  sem classe de bug de ponto flutuante, sem `Decimal` do Prisma contaminando serialização
  e Zod.
- **Peso é um instantâneo, não um histórico.** Quando a veterinária chegar, o peso
  passa a ser uma **medição datada** no prontuário, e este campo vira cache do último
  valor (ou some). Registrar isso no ADR evita a discussão futura de "por que o peso está
  no lugar errado".
- **`deceasedAt` é separado de `deletedAt`** — falecido não é excluído. O pet morto
  continua existindo na lista do dono, e todo o histórico futuro de prontuário permanece
  válido e legível. Excluir seria destruir informação clinicamente relevante e
  emocionalmente significativa.
- **Dono único** (`customerId` obrigatório, sem N:N). Família compartilhando o mesmo pet é
  caso real, mas fora de escopo; registrar no ADR que a migração para N:N é o gatilho
  previsto de revisão.
- **`photoPath` depende da sub-fase de upload** (9.10). Se o upload escorregar, a coluna
  nasce sem endpoint que a preencha — aceitável, mas melhor não criá-la antes de existir
  quem a alimente.

### 2.4 Rotas

Padrão adotado: **coleção aninhada, recurso plano.**

```
POST   /customers/:customerId/pets    criar pet para um cliente
GET    /customers/:customerId/pets    listar os pets de um cliente
GET    /pets/:petId                   detalhe
PATCH  /pets/:petId                   atualizar
DELETE /pets/:petId                   soft delete
GET    /pets                          listagem geral (staff), paginada e filtrável
GET    /breeds?species=DOG            catálogo de raças
```

**Por que o item não é aninhado** (`/customers/:c/pets/:p`): `petId` é UUID global, então
o `customerId` na rota seria redundante — e redundante significa que pode **discordar** do
dono real, obrigando a inventar uma regra (404? 403? 422?) para um caso que só existe
porque a rota o criou. A coleção continua aninhada porque ali o pai é genuinamente parte
da identificação: é *onde* o pet nasce.

**Sem `/me/pets` nesta fase.** O atalho é mais agradável de consumir e duplicaria rota,
teste e documentação; o `GET /me` já devolve `customer.id`, que é tudo que o cliente
precisa para chamar a rota aninhada. Fica no backlog.

**Autorização:** `POST` e `GET` aninhados exigem que o ator seja o próprio customer
(escopo `own`) **ou** tenha a feature `:others`. Detalhe de nomes de feature em §9.1.

### 2.5 Regras de negócio decididas

- Pet pertence a exatamente um `Customer`.
- Não há transferência de pet entre clientes nesta fase.
- Raça, quando informada, tem que ser da espécie informada → 422.
- Espécie que exige raça sem raça → 422. Espécie que não tem raça com raça → 422.
- Falecimento e exclusão são operações distintas com significados distintos.
- Cliente com perfil soft-deletado: seus pets seguem a mesma lógica já estabelecida no
  projeto (leitura filtra `deletedAt: null` em cascata). Confirmar comportamento na
  reativação de perfil (Fase 8) — os pets devem voltar junto.

### 2.6 Audit log

Ações novas, seguindo a taxonomia fechada em TypeScript e a política de metadata sem PII
(`docs/reference/logging-policy.md` §4): apenas ids e enums.

```
PET_CREATED    · metadata: { customerId, species, source: "SELF" | "STAFF" }
PET_UPDATED    · metadata: { customerId, fieldsChanged: string[] }
PET_DELETED    · metadata: { customerId }
PET_DECEASED   · metadata: { customerId }
```

`targetType: "PET"`, `targetId: pet.id`. **Nome do pet não vai para metadata** — não por
ser PII do pet, mas porque nome de pet é frequentemente usado como resposta de pergunta de
segurança e como componente de senha; e porque a política vigente é "ids e enums", que só
vale se não for flexibilizada caso a caso.

---

## 3. Bloco B — Catálogo

### 3.1 Produto e variante

**Decisão: `Product` + `ProductVariant`.**

O caso motivador é concreto: "Ração Golden Adulto" existe em 1 kg, 10,1 kg e 15 kg — com
preço, estoque e código de barras diferentes, mas mesma descrição, mesma marca e mesma
categoria.

- **`Product`** é a identidade comercial: nome, descrição, marca, categorias, tags,
  espécies-alvo, status, imagens.
- **`ProductVariant`** é a unidade vendável: SKU, preço, custo, estoque, e as
  características que variam (peso do pacote, volume, tamanho).

**Por que não produto plano** (cada peso como produto independente): a vitrine mostraria
três cards do mesmo produto, "escolher o tamanho" não existiria como conceito, e o item do
pedido da Fase 10 apontaria para algo que não é a unidade real de venda. Migrar depois é
caro; nascer certo agora não custa quase nada.

**Consequência para a Fase 10:** `OrderItem` aponta para `ProductVariant`, nunca para
`Product`.

**Todo produto tem pelo menos uma variante.** Produto sem variante não é vendável. Um
produto que "não tem variação" tem uma variante única (marcada como default) — isso evita
o caminho duplo "produto com preço próprio × produto com variantes", que é a fonte clássica
de bug em catálogo.

### 3.2 Categoria × espécie — o problema da cama

Levantado pelo usuário: uma cama de pet serve cães e gatos. Isso são duas categorias
("Cães > Camas" e "Gatos > Camas") ou uma?

**Decisão: são a mesma categoria, e a espécie sai da árvore.**

- **Categoria = função do produto**, em árvore: `Alimentação > Ração seca`,
  `Conforto > Camas`, `Higiene > Tapetes`.
- **Espécie = faceta do produto**, coluna própria: `Product.targetSpecies` como array de
  enum.

**Por quê:** "Cães > Camas" e "Gatos > Camas" não são categorias diferentes — são a mesma
categoria funcional vista por duas espécies. Modelá-las como duas faz **toda** categoria
folha se duplicar por espécie, e a árvore vira um produto cartesiano que cresce a cada
espécie nova. Separando as dimensões, a cama que serve aos dois é **uma linha** com
`[DOG, CAT]`.

**Como isso aparece na navegação:** o menu "Cães" é `?species=DOG`; o breadcrumb
"Cães > Camas" é `?species=DOG&category=camas`. A árvore de categorias fica pequena e
estável; a combinatória fica no filtro, onde ela é barata.

**Implementação:** `PetSpecies[]` no Postgres (Prisma expõe `has`/`hasSome`), com índice
GIN. Array vazio significa "serve a qualquer espécie" — evita ter que listar todas as
espécies em produto genérico e não quebra quando uma espécie nova entra no enum.

**Categoria é N:N** (`ProductCategory`), com **mínimo de uma**. Mesmo com a espécie fora da
árvore, sobra caso legítimo de dupla pertinência funcional — tapete higiênico é higiene e
é adestramento. **Tag também é N:N**, sem mínimo, para o que é transversal e volátil:
"promoção", "hipoalergênico", "filhote", "lançamento".

### 3.3 Características

**Decisão: colunas fixas na variante.** `weightGrams`, `volumeMl`, `sizeLabel`.

Alternativas descartadas: **EAV** (`Attribute` + `ProductAttribute`) dá flexibilidade
cadastrável pelo funcionário ao custo de filtro sofrível, tipagem impossível e junções em
tudo — contra o valor central do projeto, que é tipagem estrita; **JSON** é meio-termo que
funciona no Postgres mas sai do conforto do Prisma e do Zod, e permite que o dado se suje
sem que nada reclame.

Colunas fixas cobrem a esmagadora maioria dos casos de pet shop com uma fração da
complexidade. Atributo novo é migration — barato e explícito. Tags absorvem o resto.

### 3.4 Preço

**Decisão: inteiro em centavos** (`priceCents`, `compareAtPriceCents`, `costCents`).

Elimina de uma vez toda a classe de bug de ponto flutuante, é o formato que os gateways de
pagamento usam, e evita o `Decimal` do Prisma — que chega no código como objeto e
contamina serialização, Zod e comparação. Moeda fica implícita (BRL) até existir motivo
para uma coluna.

**Congelamento de preço é assunto da Fase 10**, mas a regra já está firmada: o item do
pedido **grava** o preço no momento da compra e nunca lê do produto. Deixar isso escrito
agora evita a modelagem errada lá na frente.

**`costCents` é dado interno** — nunca aparece na view do cliente. É o que motiva a view
por capability (§3.7).

### 3.5 Status e exclusão

**Decisão: enum de status *e* soft delete, com significados distintos.**

```
DRAFT        produto em cadastro, invisível no catálogo
ACTIVE       publicado e vendável
DISCONTINUED descontinuado — some da vitrine, permanece em pedidos antigos
```

`deletedAt` continua sendo o soft delete de sempre (erro de cadastro, duplicata). Um
produto descontinuado **não** está excluído: ele tem histórico de venda e pode voltar. Os
dois conceitos coexistem porque respondem a perguntas diferentes — "isto está à venda?" e
"isto existe?".

### 3.6 Marca

**Decisão: entidade `Brand`.** Pet shop é um domínio onde marca vende — o cliente busca
"Golden", "Royal Canin", "Whiskas" pelo nome. Entidade dá filtro confiável, página de marca
no futuro, logo próprio, e evita a grafia divergente que string livre garante.

### 3.7 Modelo

```prisma
enum ProductStatus { DRAFT ACTIVE DISCONTINUED }

model Brand {
  id, name @unique, slug @unique, description?, logoPath?,
  createdAt, updatedAt, deletedAt?
  products Product[]
}

model Category {
  id, name, slug @unique, parentId?, description?, position Int @default(0),
  createdAt, updatedAt, deletedAt?
  parent   Category?  @relation("CategoryTree", ...)
  children Category[] @relation("CategoryTree")
  products ProductCategory[]
}

model Tag {
  id, name @unique, slug @unique, createdAt
  products ProductTag[]
}

model Product {
  id, name, slug @unique, description,
  brandId,
  status ProductStatus @default(DRAFT),
  targetSpecies PetSpecies[],
  createdAt, updatedAt, deletedAt?
  brand      Brand
  categories ProductCategory[]
  tags       ProductTag[]
  variants   ProductVariant[]
  images     ProductImage[]
}

model ProductVariant {
  id, productId, sku @unique, label,
  priceCents Int, compareAtPriceCents Int?, costCents Int?,
  stockQuantity Int @default(0),
  weightGrams Int?, volumeMl Int?, sizeLabel String?, barcode String?,
  isDefault Boolean @default(false),
  createdAt, updatedAt, deletedAt?
}

model ProductImage {
  id, productId, path, altText?, position Int @default(0), createdAt
}

model ProductCategory { productId, categoryId  @@id([productId, categoryId]) }
model ProductTag      { productId, tagId       @@id([productId, tagId]) }
```

Imagem pertence ao **produto**, não à variante — imagem por variante é caso real
("mesmo saco, tamanhos diferentes" quase nunca precisa; "cores diferentes" precisa) mas
adiciona complexidade que o domínio de pet shop raramente cobra. Vai para o backlog.

### 3.8 Views por capability

O presenter por whitelist Zod já existente resolve isto sem risco:

| Campo | Cliente / público | Funcionário |
|---|---|---|
| preço, nome, descrição, imagens, marca, categorias, tags | ✅ | ✅ |
| `costCents`, margem | ❌ | ✅ |
| `stockQuantity` exato | ❌ | ✅ |
| disponibilidade (booleano derivado do estoque) | ✅ | ✅ |
| produtos `DRAFT` e `DISCONTINUED` | ❌ | ✅ |

Expor **disponibilidade** em vez de quantidade para o público é decisão consciente:
quantidade exata é informação competitiva e não muda nada para quem compra. Isto é uma boa
demonstração viva do presenter, e vale um teste de contrato afirmando que a view pública
não contém `costCents` nem `stockQuantity`.

### 3.9 Estoque nesta fase

`stockQuantity` como número na variante, **sem** movimentação, sem reserva, sem histórico.
A entidade `StockMovement` (append-only, auditável) é natural e desejável — e é assunto da
fase do pedido, porque é lá que a movimentação passa a ter causa. Backlog.

Pendência de regra: estoque pode ficar negativo? Ver §9.4.

### 3.10 Rotas

```
GET    /products                     listagem: paginada, ordenável, filtrável, busca
GET    /products/:idOrSlug           detalhe com variantes
POST   /products                     staff
PATCH  /products/:id                 staff
DELETE /products/:id                 staff, soft delete

POST   /products/:id/variants        staff
PATCH  /variants/:id                 staff  (recurso plano, mesmo racional dos pets)
DELETE /variants/:id                 staff

POST   /products/:id/images          upload (multipart)
DELETE /images/:id
PATCH  /products/:id/images/ordem    reordenação — formato a definir

GET    /categories                   árvore
POST   /categories · PATCH · DELETE  staff
GET    /brands · POST · PATCH · DELETE
GET    /tags    · POST · PATCH · DELETE
```

Slug no detalhe é conveniência de frontend; aceitar id **ou** slug na mesma rota é uma
decisão de contrato — ver §9.5.

### 3.11 Filtros, ordenação e paginação

**Filtros de `GET /products`:**
`?species=` · `?category=` (slug) · `?tag=` (repetível) · `?brand=` · `?minPrice=` ·
`?maxPrice=` · `?status=` (só staff) · `?inStock=` · `?q=` (busca, §4).

Faixa de preço filtra pelas **variantes**: o produto entra no resultado se **alguma**
variante estiver na faixa. Vale documentar, porque é contraintuitivo na primeira leitura.

**Ordenação — resolve a dívida do `docs/reference/backlog.md`:**

- Sintaxe: **`?sort=price&order=asc`** (decidido).
- **Allowlist por recurso** — o campo nunca vai cru para o `orderBy`. Para produtos:
  `price`, `name`, `createdAt`, e possivelmente relevância quando houver `q`. Campo fora da
  allowlist → 422.
- **Tiebreaker por `id` é obrigatório**, mesmo no offset. Dois produtos com o mesmo preço
  em páginas diferentes se repetem ou somem sem ele — o mesmo bug que o cursor da 7.7
  ensinou, e a mesma lição.
- Ordenar por preço quando o produto tem N variantes exige uma agregação (menor preço
  entre as variantes ativas). Isso é decisão de contrato: ver §9.6.
- A ordenação entra **só no offset**. No cursor, a chave teria que codificar o campo de
  ordenação — limitação já registrada no backlog, que continua registrada.

---

## 4. Busca textual

**Decisão: Postgres nativo — `tsvector` + `unaccent` + `pg_trgm`.** Escolha do usuário,
explicitamente contra a recomendação inicial (que era começar com `ILIKE`), com motivação
didática: o objetivo declarado é aprender a construir busca com tolerância a erro de
digitação, não entregar o mínimo que funciona.

**Não existe biblioteca Node que resolva isso.** A camada que resolve tolerância a typo é
o banco ou um motor de busca dedicado. A resposta de mercado quando o volume justifica é
**Meilisearch** ou **Typesense** (typo tolerance por padrão, self-hosted, ARM64) —
descartados aqui porque custam um container a mais, um pipeline de sincronização
produto→índice e uma segunda fonte de verdade que pode divergir do Postgres. Registrar como
alternativa no ADR, com gatilho de revisão explícito.

**Cada peça resolve uma coisa:**

| Peça | Resolve |
|---|---|
| `tsvector`/`tsquery` com dicionário `portuguese` | radical ("rações" acha "ração"), stopwords, ranking por relevância (`ts_rank`) |
| `unaccent` | "racao" acha "ração" |
| `pg_trgm` (similaridade por trigrama) | erro de digitação: "golen", "raçao", "royal canim" |

**Estratégia de consulta** (a definir em detalhe na sub-fase, mas o desenho pretendido):
full-text primeiro, com ranking; se o resultado vier vazio ou muito pobre, cair para
similaridade por trigrama acima de um limiar. Alternativa: pontuação combinada numa query
só (`ts_rank` + `similarity` com pesos). A segunda é mais elegante e mais difícil de
calibrar.

**Armadilhas conhecidas — documentar, porque cada uma custa uma tarde:**

1. **`unaccent` não é `IMMUTABLE`**, é `STABLE` — e coluna gerada
   (`GENERATED ALWAYS AS ... STORED`) exige função imutável. Saída padrão: criar um wrapper
   marcado `IMMUTABLE` sobre `unaccent`, ou manter a coluna por trigger. As duas têm
   ressalvas; a escolha vale registro no ADR.
2. **Extensões precisam de `CREATE EXTENSION`** em migration escrita à mão — o Prisma não
   as declara. Isso afeta dev, test e prod: o container de teste precisa das extensões, ou
   metade da suíte quebra por um motivo que não parece ser esse.
3. **Índices:** GIN sobre a coluna `tsvector`; GIN com `gin_trgm_ops` sobre o texto para a
   similaridade. Sem eles, a busca funciona e é lenta — e a lentidão só aparece com volume,
   ou seja, depois do deploy.
4. **Prisma e SQL cru:** a busca sai por `$queryRaw` com template parametrizado (nunca
   concatenação — `q` vem do usuário). O corte de camadas se mantém: **quem escreve SQL
   cru é o repository**, e ele devolve dado, não linha de banco crua vazando para cima.
5. **`websearch_to_tsquery`** é mais tolerante a entrada humana que `to_tsquery` (que
   explode com sintaxe inválida) — preferir.
6. **Limiar de similaridade** (`pg_trgm.similarity_threshold` / `set_limit`) é sessão-scoped
   no Postgres; com pool de conexões, definir por query em vez de por sessão.

**O que buscar:** nome do produto, nome da marca, descrição — provavelmente com pesos
diferentes (`setweight`: nome pesa mais que descrição). Tags também são candidatas
naturais.

**Testes:** esta é a sub-fase com maior risco de teste frouxo. O teste tem que afirmar
comportamento observável — "buscar `racao golden` encontra o produto 'Ração Golden Adulto'",
"buscar `golen` (com typo) encontra", "buscar `xyzabc` não encontra", "resultado mais
relevante vem primeiro" — e não a forma da query.

---

## 5. Upload de imagem

**Decisão: disco local, atrás de um adaptador de storage, servido pelo reverse proxy.**

Restrições do usuário: hospedagem própria, VPS ARM64, **custo zero**, e a intenção
declarada de aprender como upload funciona de verdade.

**Desenho:**
- Volume Docker montado no container da app; a app grava o arquivo e guarda **o path** no
  banco (nunca a URL completa — a base é derivada de env var, para não amarrar o dado ao
  domínio).
- O **reverse proxy serve `/uploads/*` como estático**, sem passar por Node.
- **Adaptador de storage** (`put` / `delete` / `url`) com implementação
  `LocalDiskStorage`. O service nunca sabe que existe disco. Se um dia o VPS apertar,
  trocar por R2/S3 é uma classe nova e uma env var — o mesmo corte que o repository já faz
  com o Prisma.

**O que o teste tem que guardar:**
- **Validação por magic bytes**, não por `Content-Type` (que o cliente escolhe) nem por
  extensão do nome.
- **Nome de arquivo gerado por nós** (uuid + extensão derivada do tipo real). Nome vindo do
  usuário é vetor de path traversal — nunca tocar no disco com ele.
- **Teto de tamanho** e **teto de quantidade por produto**.
- **Normalização/redimensionamento** (biblioteca `sharp` roda bem em ARM64) — sem isso, um
  JPEG de 12 MB de câmera vira o padrão.
- **Órfãos:** produto excluído deixa arquivo. Precisa de exclusão no mesmo fluxo **e** de
  um script de varredura — o projeto já tem o padrão (`src/scripts/` + systemd timer em
  `infra/cron/`).
- **Transacionalidade:** disco não participa da transação do Postgres. Ordem importa —
  gravar o arquivo, depois a linha; se a linha falhar, apagar o arquivo. Um arquivo órfão é
  muito menos grave que uma linha apontando para arquivo inexistente.

**O demo público é o ponto de atenção maior.** Upload aberto na internet é abuso de disco
garantido:
- A role `demo` **não** pode subir arquivo (é read-only por definição — mas vale o teste
  explícito).
- O `demo-reset` passa a limpar o diretório de upload, dentro da guarda `DEMO_MODE=true`
  que já existe.
- Rate limit próprio para o endpoint de upload, e teto de tamanho agressivo.

**Foto de pet** reaproveita o mesmo adaptador, depois que ele existir.

---

## 6. Decisão herdada pela Fase 10 — produto × serviço

O app, no longo prazo, vende **produtos e serviços** (banho, tosa, consulta). Serviço não
entra na Fase 9, mas a decisão de modelagem foi tomada agora porque o custo de errá-la
aparece na Fase 10, no item do pedido: quando alguém compra 1 saco de ração e 1 banho, o
pedido tem dois itens — e o banco não tem FK que aponte para duas tabelas.

Caminhos avaliados:

1. **Tudo é `Product`, com `kind = PRODUCT | SERVICE`.** Item do pedido com FK única,
   carrinho sem ramificação. Custo: serviço não tem peso, estoque, variante nem marca;
   produto não tem duração, profissional executante nem pet atendido. A tabela vira metade
   colunas nulas e a validação "obrigatório se `kind = SERVICE`" migra do banco para o
   código. Armadilha confortável.
2. ✅ **`Product` e `Service` separados, `OrderItem` polimórfico.** Escolhido.
3. **Supertipo `SellableItem` com `Product`/`Service` como subtipos** compartilhando a PK
   (*class table inheritance*). Academicamente o mais correto: FK única, sem coluna nula.
   Custo: uma junção a mais em **toda** leitura de catálogo — justamente a parte mais usada
   — e duas escritas coordenadas em todo cadastro.

**Decisão: opção 2.** Não porque a 3 esteja errada — é mais correta — mas porque o
benefício dela é integridade referencial num ponto só, e o custo é junção e cerimônia no
caminho mais quente do sistema.

**O que isso obriga (na Fase 10, não agora):** `OrderItem` ganha `productVariantId` e
`serviceId`, ambos nullable, com um **CHECK constraint** garantindo que exatamente um está
preenchido. O Prisma não declara CHECK — é SQL escrito à mão na migration.

**O que isso obriga agora:** nada no schema da Fase 9. `Product`/`ProductVariant` nascem
como já descrito. O que muda é que a Fase 10 já sabe o formato que `OrderItem` vai ter.

**ADR próprio** — "por que serviço não é um produto" é exatamente o tipo de decisão que o
leitor do repositório vai querer ver justificada, e que parece arbitrária sem o registro.

---

## 7. Backlog — o que sai da fase com valor reconhecido

Entradas a acrescentar em `docs/reference/backlog.md`, com o racional de por que ficaram fora:

- **Transferência de pet entre clientes** — caso real (venda, doação, mudança de tutor).
  Fora por escopo; precisa de trilha de auditoria própria e de decisão sobre o que
  acontece com o histórico clínico.
- **Múltiplos donos por pet** — família compartilhando. Gatilho para migrar `customerId`
  de FK para tabela de junção.
- **`/me/pets`** — atalho de conveniência; hoje resolvido por `GET /me` + rota aninhada.
- **`StockMovement`** — movimentação de estoque append-only e auditável. Natural na fase do
  pedido, onde a movimentação passa a ter causa.
- **Imagem por variante** — hoje a imagem é do produto.
- **Meilisearch/Typesense** — alternativa à busca no Postgres, com o gatilho de revisão.
- **Storage externo (S3/R2)** — o adaptador já deixa a porta aberta; o gatilho é pressão
  de disco no VPS.
- **Histórico de preço** — hoje só o preço corrente. O congelamento no pedido (Fase 10) é
  outra coisa e é obrigatório.
- **Peso do pet como medição datada** — vira parte do prontuário quando a veterinária
  chegar.
- **Ordenação no cursor** — permanece limitação conhecida do helper de paginação.

---

## 8. Caminho de desenvolvimento

Sessões sugeridas, em ordem de dependência. Cada uma vira uma seção do `docs/todo.md` com
checklist atômico, e cada uma tem sua branch `feat/fase-9-<n>-<slug>`.

| # | Sessão | Por que nesta posição |
|---|---|---|
| **9.1** | **RBAC do domínio — decisão + seed** | Toda rota nova precisa de feature. Sessão de **decisão com o usuário**, praticamente sem código: definir nomes de features, quais roles as recebem, se nascem roles novas de funcionário. Ver §9.1. |
| **9.2** | **Ordenação configurável no helper de paginação** | Dívida do backlog. Habilita todas as listagens da fase — fazer antes evita retrabalho em cada uma. |
| **9.3** | **Espécies, raças e seed de `Breed`** | Pré-requisito do CRUD de pets. Inclui a curadoria da constante e `GET /breeds`. |
| **9.4** | **Pets — CRUD, escopo próprio** | O núcleo do bloco A. |
| **9.5** | **Pets — escopo staff, listagem geral, filtros** | Depende de 9.2 e 9.4. |
| **9.6** | **Taxonomia do catálogo — `Brand`, `Category` (árvore), `Tag`** | Pré-requisito de `Product`. Árvore de categoria tem seus próprios casos (ciclo no `parentId`, exclusão com filhos). |
| **9.7** | **`Product` + `ProductVariant` — escrita** | O núcleo do bloco B. |
| **9.8** | **Catálogo — leitura, views por capability, filtros** | Depende de 9.2, 9.6, 9.7. |
| **9.9** | **Busca textual** | Depende de 9.8 existir para ter o que buscar. A sessão de maior risco técnico — isolada de propósito. |
| **9.10** | **Adaptador de storage + upload de imagem** | Independente do resto; podia vir antes, mas é a sessão com mais infra e menos domínio. Inclui foto de pet, se couber. |
| **9.11** | **Seed fake do domínio + `demo-reset`** | Depende de todo o schema estar firme. É o que faz o demo público parar de mostrar listas vazias — item já registrado no backlog. |
| **9.12** | **Fechos** | `docs/reference/endpoints.md`, coleção Bruno, README (roadmap + contagem de testes), `context/pet-domain.md` e `context/history.md`, revisão do backlog. |

**Ponto de atenção sobre a 9.1:** ela é uma sessão de conversa, não de código. Não comece
a 9.4 sem ela fechada — cada endpoint escrito com nome de feature provisório é um endpoint
que será reescrito.

---

## 9. Pendências — o Claude Code NÃO decide sozinho

Todas são regra de negócio. Pergunte no formato do `CLAUDE.md` (2–4 caminhos, consequência
de cada, recomendação, esperar a decisão) na abertura da sub-fase correspondente.

### 9.1 RBAC do domínio — sub-fase 9.1

O usuário declarou explicitamente que quer pensar nisso com calma, olhando a lista de
endpoints já pronta. O que precisa ser decidido:

- **Nomes das features** de pet (`create:pet`, `read:pet`, … + variantes `:others`) e de
  catálogo (`create:product`, `manage:catalog`, `read:product:internal`, …).
- **Granularidade:** uma feature por operação por recurso, ou features agrupadas por
  domínio (`manage:catalog` cobrindo marca, categoria e tag)? A primeira é mais precisa e
  infla o catálogo de features; a segunda é mais enxuta e menos flexível para override.
- **Quais roles recebem o quê.** Já decidido: **atendente cadastra pet no nome de um
  cliente**. Em aberto: quem cadastra produto, quem mexe em estoque, quem vê custo e
  margem.
- **Nascem roles novas?** O usuário levantou a hipótese ("talvez nasçam roles novas na
  parte de funcionário") — candidatas naturais: `stockist` (estoque), `catalog-manager`
  (catálogo). Hoje `attendant` só tem self-management; o catálogo pode cair em `manager`
  ou justificar role própria.
- **A role `demo`** precisa das features de leitura novas, senão o demo público continua
  mostrando 403 onde deveria mostrar catálogo.
- **Alguma feature nova é privilegiada** (entra em `PRIVILEGED_FEATURES`)? Custo e margem
  são candidatos.

### 9.2 Catálogo público ou autenticado?

Se `GET /products` responde sem token, esse vira o **primeiro endpoint público de leitura
em volume** do projeto. Consequências reais: rate limit próprio, cache (o Redis já está
lá), e a view precisa ser à prova de vazamento por definição, não por permissão.

Alternativas: totalmente público · exige token mas qualquer usuário autenticado serve ·
público com campos reduzidos e detalhes só autenticado.

### 9.3 Unicidade de `microchipId` e `sku`

Mesmo problema já documentado no `docs/reference/backlog.md` para email/cpf: `@unique` no Postgres
vale também para a linha soft-deletada, então um produto excluído prende o SKU para sempre.
Caminhos: unique global e aceitar o efeito · unique parcial (`WHERE deleted_at IS NULL`,
exige editar a migration à mão) · sem unique, com validação no service.

O microchip tem um agravante próprio: é um identificador do mundo real, e duplicata é sinal
de erro de digitação — mas também de pet transferido entre clientes (que é backlog).

### 9.4 Estoque pode ficar negativo?

Sem carrinho ainda, o único caminho de mudança é edição manual pelo staff. Aceitar
negativo (registra a realidade de um erro de contagem) ou barrar em 422? A decisão volta
na Fase 10 com muito mais peso.

### 9.5 Detalhe por id ou por slug?

`GET /products/:idOrSlug` aceitando os dois é conveniente para frontend e ambíguo de
contrato (o que acontece se um slug for um uuid válido?). Alternativa: rotas separadas, ou
só id com o slug virando query (`?slug=`).

### 9.6 Ordenação por preço com N variantes

Produto tem várias variantes com preços diferentes. Ordenar por "preço" significa: menor
preço entre as variantes ativas · preço da variante default · o produto aparece uma vez por
variante. Muda a query e muda o que o usuário vê.

### 9.7 Categoria — regras da árvore

Profundidade máxima? Categoria com filhos pode ser excluída? Produto pode ser vinculado a
uma categoria intermediária ou só a folha? Excluir categoria com produtos vinculados —
bloqueia (409) ou desvincula?

### 9.8 Slug — gerado ou informado?

Gerado a partir do nome (e o que acontece quando o nome muda — slug muda e quebra link
externo, ou congela?) ou informado pelo staff (controle total, risco de colisão e de slug
feio)?

### 9.9 Pets de um cliente soft-deletado

Confirmar o comportamento esperado na reativação de perfil da Fase 8: os pets voltam junto
automaticamente, ou a reativação escolhe? O padrão do projeto sugere que voltam junto, mas
é regra de negócio.

---

## 10. ADRs a criar

| Arquivo sugerido | Cobre |
|---|---|
| `docs/adr/pet-domain-modeling.md` | Espécie como enum sem `OUTRO`; raça como tabela semeada por constante e por que não API em runtime; `SPECIES_WITH_BREED` explícita e não derivada; dono único; falecimento ≠ exclusão; peso como instantâneo que a veterinária vai mover. |
| `docs/adr/product-catalog-modeling.md` | `Product` + `ProductVariant` e por que não produto plano; espécie como faceta e não como nível da árvore de categoria; categoria e tag N:N; características como colunas fixas (EAV e JSON descartados); preço em centavos; status × soft delete; marca como entidade. |
| `docs/adr/product-vs-service.md` | A decisão herdada pela Fase 10: tabelas separadas com `OrderItem` polimórfico e CHECK constraint; por que não `kind` único e por que não supertipo. |
| `docs/adr/text-search.md` | Postgres nativo (`tsvector` + `unaccent` + `pg_trgm`); por que não `ILIKE`; Meilisearch/Typesense como alternativa descartada com gatilho de revisão; a armadilha do `unaccent` não-imutável; extensões em migration manual. |
| `docs/adr/file-storage-and-uploads.md` | Disco local atrás de adaptador; path no banco e não URL; validação por magic bytes; nome gerado; órfãos e varredura; restrições do ambiente demo; gatilho para storage externo. |
| **Adendo** em `docs/adr/pagination.md` | Ordenação configurável: sintaxe `?sort=&order=`, allowlist por recurso, tiebreaker por id obrigatório, e por que só no offset. |

---

## 11. Docs de referência a atualizar

- **`docs/todo.md`** — a fase inteira, na estrutura de sessões da §8, com checklist
  atômico por sessão e as pendências da §9 ancoradas na sessão em que devem ser
  perguntadas.
- **`docs/context/pet-domain.md`** — ponteiros da Fase 9, promovidos a "implementada" no
  fecho; parágrafo "Fase 9 (fechada)" em §4 ao final, no mesmo padrão das fases 7 e 8.
- **`CLAUDE.md`** — seção de domínio: o corte produto/variante, a regra da espécie como
  faceta, a convenção de valores monetários e de peso em inteiro, e o corte "SQL cru vive
  no repository".
- **`docs/reference/endpoints.md`** — todas as rotas novas.
- **`docs/reference/logging-policy.md`** — as ações novas do audit log e a nota sobre nome de pet
  fora da metadata.
- **`docs/reference/backlog.md`** — as entradas da §7.
- **`README.md`** — roadmap (Fase 9 sai de "A seguir"), contagem de testes, e provavelmente
  uma linha sobre o catálogo no que o projeto faz.
- **`.env.example`** — variáveis de upload (diretório, teto de tamanho, base URL pública).
- **`api-collection/`** — pastas Bruno novas por módulo (pets, breeds, products, variants,
  categories, brands, tags), com environments `local` e `prod`.
- **`infra/cron/`** — timer da varredura de arquivos órfãos, se a 9.10 concluir que é
  necessário.
