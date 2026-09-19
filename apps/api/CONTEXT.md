# Pet Oasis API

A API REST do Pet Oasis, uma loja de pet shop. É o contexto dono dos dados e das regras de
negócio: usuários e perfis, autorização, sessões, pets e catálogo. Os clientes (o web, a
coleção Bruno) falam com ela por HTTP e importam os tipos do contrato
(`@pet-oasis/api-contracts`), que exporta o vocabulário daqui sem criar termo próprio.

Este glossário diz **o que** cada termo é. O **porquê** de cada decisão vive num ADR
(índice em [`docs/adr/README.md`](./docs/adr/README.md)); onde a definição precisa de racional,
ela aponta para ele.

## Language

### Identidade

**User**:
A conta em si — credencial (email, senha), CPF, `status`, ban. Não é a pessoa no papel dela:
o papel é o perfil.
_Avoid_: conta, usuário final, cliente

**Perfil**:
O papel de um `User` no domínio, definido pela **presença** da relação (`User.customer`,
`User.employee`), não por um campo de tipo. Só existem dois, `Customer` e `Employee`; todo
`User` ativo tem ao menos um perfil ativo, e cada perfil tem ao menos uma role.
_Avoid_: tipo de usuário, categoria de usuário, conta de cliente/funcionário

**ProfileKind**:
O enum que nomeia os dois perfis (`CUSTOMER`, `EMPLOYEE`). Aparece em `Role.appliesTo` e no
que uma reativação pede de volta (`restoreProfiles`).
_Avoid_: tipo de perfil, `UserType`

**Customer**:
Perfil de quem compra e tem pets. Carrega `phone` (único), endereço e data de nascimento.
_Avoid_: cliente (ambíguo com o consumidor HTTP), comprador

**Employee**:
Perfil de quem trabalha na loja. Carrega `hiringDate`.
_Avoid_: funcionário admin, staff (é a gíria das rotas, não o nome do perfil), operador

**Híbrido**:
`User` com os dois perfis ativos ao mesmo tempo. Caso de primeira classe no seed e nos testes,
não exceção.
_Avoid_: usuário duplo, caso especial

**Status**:
`User.status`: `PENDING` (email ainda não verificado) ou `ACTIVE`. Todo usuário nasce
`PENDING`, inclusive os criados por admin. Ortogonal ao ban — ver
[`0060`](./docs/adr/0060-status-ban-sao-ortogonais.md).
_Avoid_: estado da conta, `BANNED` como valor de status, "ativo" para dizer "não deletado"

**Verificação de email**:
O passo que leva o `User` de `PENDING` a `ACTIVE`: um `VerificationToken` de propósito
`EMAIL_VERIFICATION` enviado por email e confirmado pelo dono.
_Avoid_: ativação da conta, confirmação de cadastro

**VerificationToken**:
Token opaco de uso único (só o hash é guardado) com `purpose`, `expiresAt` e `usedAt`. Os
propósitos são `EMAIL_VERIFICATION`, `PASSWORD_RESET`, `EMAIL_CHANGE` e
`ACCOUNT_REACTIVATION`; `change-password` não usa token — a prova é a senha atual.
_Avoid_: código de verificação, link mágico, OTP

**Troca de email**:
Fluxo em dois passos: o pedido grava o alvo em `User.pendingEmail` e emite um token
`EMAIL_CHANGE`; a confirmação promove o alvo a `email` e registra o antigo em `PreviousEmail`.
_Avoid_: atualização de email pelo `PATCH`, alteração de contato

**PreviousEmail**:
Histórico dos emails que um `User` já teve. Só histórico: não reserva o endereço — ver
[`0082`](./docs/adr/0082-previousemail-reservava-endereco-sempre-parou-reservar.md).
_Avoid_: email bloqueado, email reservado

**Ban**:
A conta congelada por um admin: `bannedAt`/`bannedBy`/`banReason` preenchidos, sessões
derrubadas, e nada funciona — login, reset, change, resend. Reversível só por desban de um
admin; não altera o `status`.
_Avoid_: bloqueio (é o lockout), suspensão, desativação, "conta travada" (é o lockout)

**Lockout**:
A conta travada por tentativas de login erradas consecutivas: janela fixa que vira backoff
exponencial, guardada no Redis, zerada no login certo ou pelo admin. Responde 429 genérico,
igual ao rate limit. Não é o ban.
_Avoid_: bloqueio de conta, ban, "conta congelada" (é o ban)

**Rate limit**:
Teto de requests por chave — IP, usuário ou email destinatário — num balde do Redis. Protege
contra volume, não contra força bruta numa credencial: isso é o lockout.
_Avoid_: throttle, lockout

**Demo**:
A role `demo` (`EMPLOYEE`, só features de leitura, sempre semeada) e o usuário demo
(credencial pública, atrás de `SEED_DEMO_USER`). A conta demo é isenta do lockout e o
`demo-reset` a restaura.
_Avoid_: usuário de teste, sandbox, conta convidada

### Sessão

**Session**:
Uma linha por **refresh token emitido**: o login cria uma, cada rotação em `/refresh` marca a
anterior como usada (`usedAt`) e cria outra. Não é uma família de dispositivo — não existe
id agregando as rotações de um mesmo login.
_Avoid_: dispositivo, login, token (é o que ela guarda, não o que ela é)

**Access token**:
JWT de 15 minutos, validado localmente por assinatura, expiração, `iss`/`aud`. Entregue no
header `Authorization: Bearer`; não é revogável antes de expirar — ver
[`0001`](./docs/adr/0001-auth-token-revocation.md).
_Avoid_: token de sessão, JWT de sessão, cookie

**Refresh token**:
Token opaco, hasheado em repouso (`Session.refreshTokenHash`), TTL de 7 dias deslizante,
rotativo: cada uso o troca por um novo.
_Avoid_: token de renovação, token longo

**Sessão viva**:
`Session` com `usedAt`, `invalidatedAt` nulos e `expiresAt` no futuro. É o que
`GET /auth/sessions` lista e o que ban, reset e change derrubam.
_Avoid_: sessão ativa (colide com o `status`), sessão aberta

**Reuso de refresh**:
Apresentar um refresh token que já tem `usedAt`. É tratado como sinal de roubo.
_Avoid_: replay, refresh duplicado

### Autorização

**Feature**:
Uma capacidade nomeada e concedível, na forma `verbo:recurso[:qualificador]`
(`read:user`, `manage:product`). `:others` é agir sobre o recurso de outro usuário; sem o
sufixo, é sobre o próprio. Os nomes são contrato (`FEATURE_NAMES`); a descrição é seed.
_Avoid_: permissão, escopo, privilégio

**Role**:
Um agrupamento nomeado de features, definido em código e semeado, read-only via API. Tem
`appliesTo` (`ProfileKind`) e só pode ser atribuída a um perfil compatível. As roles são
`customer`, `attendant`, `stockist`, `catalog-manager`, `manager`, `admin` e `demo`.
_Avoid_: grupo, cargo, nível de acesso, perfil

**Atribuição de role**:
A linha `UserRole` que liga um `User` a uma `Role` — uma por par `(userId, roleId)`, para
sempre, revivida na re-concessão. É nela que o override pendura.
_Avoid_: vínculo user↔role (aceitável em prosa, mas o recurso é a atribuição), cargo do usuário

**Override**:
Uma linha `UserFeature`: ajuste de uma feature — `granted: true` concede, `false` nega —
pendurado numa **atribuição de role** específica, nunca no `User` solto. Perder a role mata os
overrides dela; nenhum override ressuscita por efeito colateral — ver
[`0005`](./docs/adr/0005-authorization-scope-and-lifecycle.md).
_Avoid_: permissão customizada, exceção, feature do usuário

**Feature efetiva**:
O que um `User` pode de fato: `(⋃ features das roles ∪ grants) − denies`, computado em runtime
por `computeEffectiveFeatures` só sobre linhas vivas. É o `features` de `GET /me` e a
*capability* pela qual o presenter escolhe a view.
_Avoid_: permissões do usuário, acessos, capability (mesma coisa; prefira o nome do código)

**Wildcard**:
A feature `*`: quem a tem pode tudo. Só a role `admin` a carrega.
_Avoid_: superusuário, root, "todas as features"

**Feature privilegiada**:
Feature de `PRIVILEGED_FEATURES`: as quatro do próprio sistema de permissão
(`PERMISSION_FEATURES`) mais `read:audit-log:full`. Conceder uma — por override ou por role que
a contenha — exige que o ator tenha a role `admin`.
_Avoid_: feature de admin, feature sensível, `read:product:cost` (é segredo comercial, não
escalação)

**Não-escalação**:
A regra de que ninguém concede feature privilegiada, bane ou desbane alvo privilegiado ou destrava
alvo privilegiado sem ser `admin`. A âncora é a **role** `admin`, não a feature.
_Avoid_: anti-escalação, guard de admin

**Ator**:
O `User` autenticado que executa a request — quem o audit log registra como `actorId` e sobre
quem a autorização é decidida. Na escolha da view ele é chamado de *viewer*.
_Avoid_: usuário logado, requester, caller

**Anônimo**:
O visitante sem ator: sem `Bearer`, ou com um token ruim numa rota de autenticação opcional.
Vê a view pública e nunca recebe 401 na vitrine.
_Avoid_: guest, público (é o nome da view, não do visitante)

### Ciclo de vida

**Soft delete**:
Marcar `deletedAt` em vez de apagar a linha. É o padrão de todo recurso com histórico
(`User`, perfis, `UserRole`, `UserFeature`, `Pet`, `Product`, `ProductVariant`, `Brand`,
`Category`); toda leitura filtra `deletedAt: null`.
_Avoid_: exclusão lógica, desativação, arquivamento

**Hard delete**:
Apagar a linha. No domínio só `Tag` e `ProductImage` fazem isso; fora dele, teardown de teste e
scripts de faxina.
_Avoid_: exclusão física, purge

**Cascata**:
A deleção descendo o grafo com **um único `new Date()`** por transação: `User` → perfis →
`UserRole` → `UserFeature`, e `Customer` → `Pet`, `Product` → `ProductVariant`. Nunca existe
filho ativo de pai morto.
_Avoid_: `onDelete: Cascade` (é ação do banco em hard delete; a cascata daqui é escrita à mão)

**Restauração**:
A primitiva que desfaz o soft delete subindo **dois** níveis: o pai nomeado volta, e volta o
filho cujo `deletedAt` é **igual** ao dele (correlação por data). Para na `UserRole` — override
não volta — ver [`0005`](./docs/adr/0005-authorization-scope-and-lifecycle.md).
_Avoid_: undelete, reativação (é o fluxo de produto que usa a restauração), rollback

**Correlação por data**:
O critério da restauração: filho volta se `filho.deletedAt == pai.deletedAt`. Não existe
coluna de motivo.
_Avoid_: escopo de deleção, flag de cascata

**Reativação**:
O fluxo de produto que traz de volta uma conta ou um perfil soft-deletados. De conta: pelo
signup ou pelo admin, sempre confirmada pelo dono por token `ACCOUNT_REACTIVATION`, com senha
nova. De perfil: a mesma rota que cria também reativa.
_Avoid_: restauração (é a primitiva), reabertura, recuperação de conta

**Dado de referência**:
Tabela semeada por constante versionada (`Feature`, `Role`, `RoleFeature`, `Breed`): sem
`deletedAt`, sobrevive ao `clearDatabase` dos testes e ao `demo-reset`.
_Avoid_: tabela de lookup, dado estático, seed (é como ele entra, não o que ele é)

### Pets

**Pet**:
O animal de um `Customer` — dono único e obrigatório (`customerId`), sem tabela de junção.
Cascateia e volta com o dono.
_Avoid_: animal, bichinho, paciente

**PetSpecies**:
Enum fechado de espécies (`DOG`, `CAT`, `RABBIT`, `BIRD`, `RODENT`, `REPTILE`, `FISH`), sem
valor `OUTRO`. Serve ao `Pet` (`species`) e ao `Product` (`targetSpecies`).
_Avoid_: tipo de animal, categoria de pet, espécie como texto livre

**Breed**:
Raça, dado de referência por `(species, name)`. Só `DOG` e `CAT` exigem raça
(`SPECIES_WITH_BREED`); as demais exigem `breedId` ausente. Toda espécie com raça tem uma
linha `SRD`.
_Avoid_: raça como texto livre, variedade (ave e roedor têm variedade, não raça)

**SRD**:
"Sem raça definida": a linha de `Breed` que o pet sem raça de uma espécie com raça seleciona.
_Avoid_: vira-lata, "sem raça" (a raça existe; é a SRD), `null` em `breedId`

**Falecimento**:
`Pet.deceasedAt`: o pet morreu, mas o registro continua na lista do dono. Marcado por rota
própria (`POST`/`DELETE /pets/:petId/deceased`), nunca pelo `PATCH`. Não é soft delete.
_Avoid_: óbito como exclusão, `deletedAt`, "pet inativo"

**Balcão**:
A leitura de pets feita pelo staff a partir da base inteira (`GET /pets`), em oposição à
coleção de um dono (`GET /customers/:customerId/pets`).
_Avoid_: listagem admin, listagem geral

### Catálogo

**Product**:
A identidade comercial de um item — nome, `slug`, descrição, marca, categorias, tags,
espécies-alvo, `status`, imagens. **Não tem preço nem estoque.** Sempre tem ao menos uma
variante.
_Avoid_: item, SKU, produto plano, "o que se compra"

**ProductVariant**:
A unidade vendável: `sku` (único global), `label`, `priceCents`, `compareAtPriceCents`,
`costCents`, `stockQuantity`, e o que varia (`weightGrams`, `volumeMl`, `sizeLabel`). É para
ela que um item de pedido apontará.
_Avoid_: produto, item, tamanho, opção

**Variante default**:
A `ProductVariant` com `isDefault: true` — exatamente uma por produto, garantida pelo service.
É a que a vitrine mostra sem desempate.
_Avoid_: variante principal, variante padrão (mesmo sentido; prefira o nome do código)

**Status do produto**:
`ProductStatus`: `DRAFT`, `ACTIVE` ou `DISCONTINUED`. Responde "está à venda?"; o soft delete
responde "existe?". `DISCONTINUED` não é excluído.
_Avoid_: produto inativo, produto arquivado, `deletedAt` como "fora de linha"

**Brand**:
Marca, entidade própria com `name`/`slug` únicos globais e logo. Todo produto tem uma.
_Avoid_: marca como texto livre, fabricante, fornecedor

**Category**:
Nó de uma árvore de no máximo três níveis que modela **função** do produto
(`Alimentação > Ração > Ração seca`), nunca espécie. Produto vincula a qualquer nó, folha ou
não, com mínimo de uma categoria; `slug` único global, `name` não.
_Avoid_: departamento, seção, "Cães > Camas" (espécie não é nível da árvore)

**Espécie-alvo**:
`Product.targetSpecies: PetSpecies[]`, a faceta que diz a que espécies o produto serve. Array
vazio significa "qualquer espécie" e casa com todo filtro `?species=`.
_Avoid_: categoria de espécie, público-alvo, "para cães" como categoria

**Tag**:
Rótulo transversal e volátil, N:N com produto, sem mínimo ("promoção", "filhote"). Hard delete.
_Avoid_: etiqueta, label (é campo da variante), categoria

**Slug**:
Identificador de URL de `Product`, `Brand`, `Category` e `Tag`: derivado do nome na criação
(ou informado no corpo), único global, **congelado** depois — renomear não o muda. Nunca tem
forma de UUID.
_Avoid_: permalink, handle, nome normalizado

**ProductImage**:
Imagem do **produto** (não da variante): `path` é a chave base no storage, `position` ordena,
e a capa é a posição `0` — sem flag. Hard delete.
_Avoid_: foto da variante, `isCover`, URL (o que se grava é o path)

**Disponibilidade**:
`inStock`, booleano derivado: na variante, `stockQuantity > 0`; no produto, alguma variante
ativa com estoque. Presente em todas as views — é o que o público vê no lugar da quantidade.
_Avoid_: estoque (é a quantidade exata, interna), "em estoque" como campo próprio

**Preço em centavos**:
Todo valor monetário é inteiro em centavos (`priceCents`, `compareAtPriceCents`, `costCents`);
peso é inteiro em gramas (`weightGrams`). Moeda implícita (BRL).
_Avoid_: `Decimal`, float, `price` sem sufixo

**Busca textual**:
`GET /products?q=`: busca no nome do produto, nome da marca e descrição com radical, sem
acento e tolerância a erro de digitação, nativa do Postgres — ver
[`0009`](./docs/adr/0009-text-search.md).
_Avoid_: filtro por nome, `ILIKE`, autocomplete

### Superfície e views

**Vitrine**:
A superfície pública do catálogo: `GET /products`, `GET /products/:idOrSlug`, `/categories`,
`/brands`, `/tags`, `/breeds`. Responde sem token, com rate limit por IP; a autenticação é
opcional e serve só para escolher a view.
_Avoid_: loja, storefront, e-commerce, "rotas públicas" (também há `/auth`)

**View**:
O shape de resposta de um recurso, um schema Zod por whitelist: `.parse()` derruba o que não
está listado. Cada recurso tem uma ou mais views, resolvidas pela feature efetiva do viewer,
nunca pela role.
_Avoid_: DTO, serializer, resposta, projeção

**Presenter**:
O helper que aplica a view sobre o dado do service antes de responder.
_Avoid_: serializer, mapper, formatter

**Escada de views do produto**:
`public` → `internal` → `cost`: a pública sem `costCents`, sem `stockQuantity` exato e sem
`DRAFT`/`DISCONTINUED`; `internal` (`read:product:internal`) acrescenta estoque e status;
`cost` (`read:product:cost`) acrescenta custo e implica a interna.
_Avoid_: view de admin, view de staff, view de cliente (é a `public`)

**Views do usuário**:
`default` (id, name) → `owner` (+ email, `pendingEmail`, cpf, perfis) → `me` (+ features
efetivas) → `admin` (+ timestamps e atribuições de role com os overrides dentro).
_Avoid_: view completa, view resumida

### Auditoria

**Audit log**:
A trilha durável de quem fez o quê, em quem, quando: `AuditLog`, append-only, gravada na mesma
transação da ação, com `action` numa taxonomia fechada (`AUDIT_ACTIONS`) e `targetType` em
`AUDIT_TARGET_TYPES`. `actorId`/`targetId` são uuid cru, sem FK. Não é o access log nem o
application log — ver [`0133`](./docs/adr/0133-tres-categorias-de-log-nao-uma.md).
_Avoid_: log, histórico, trilha de auditoria (aceitável em prosa; o termo do código é audit
log)
