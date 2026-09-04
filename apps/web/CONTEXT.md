# Pet Oasis Web

Frontend web do Pet Oasis, uma loja de pet shop. Consome a API REST do repo
`pet-oasis-api` e não tem banco nem regra de negócio própria — o que existe aqui é
apresentação, navegação e sessão.

Este glossário fixa a linguagem da interface. A maior parte dos termos é herdada da API;
estão repetidos aqui porque a UI é justamente onde a linguagem escorrega: o texto de um
botão não passa por type-check.

## Language

### Superfícies

**Vitrine**:
Superfície pública e anônima: catálogo, busca e detalhe de produto. Responde sem token.
_Avoid_: loja, storefront, home, e-commerce

**Área do cliente**:
Superfície do `Customer` autenticado: seus pets, sua conta, suas sessões.
_Avoid_: perfil, dashboard, minha área

**Back-office**:
Superfície do `Employee` autenticado: usuários, permissões, catálogo e auditoria.
_Avoid_: admin, painel, gestão

### Identidade

**User**:
A conta em si — credencial, email, CPF, status. Não é a pessoa no papel dela.
_Avoid_: cliente, usuário final, conta

**Perfil**:
O papel de um `User` no domínio, definido pela **presença** da relação e não por um campo
de tipo. Só existem dois: `Customer` e `Employee`.
_Avoid_: tipo de usuário, categoria

**Customer**:
Perfil de quem compra e tem pets. Todo `Customer` pertence a um `User`.
_Avoid_: cliente (ambíguo em front: também significa navegador), comprador

**Employee**:
Perfil de quem trabalha na loja.
_Avoid_: funcionário admin, staff, operador

**Híbrido**:
`User` com os dois perfis ativos ao mesmo tempo. É caso de primeira classe, não exceção:
tem telas, tem troca de contexto explícita e alcança as duas superfícies autenticadas.
_Avoid_: usuário duplo, caso especial

### Catálogo

**Product**:
Identidade comercial de um item — nome, descrição, marca, categorias. **Não tem preço nem
estoque.**
_Avoid_: usar para o que é comprável

**ProductVariant**:
A unidade vendável: SKU, preço e estoque. Todo `Product` tem pelo menos uma.
_Avoid_: produto, item, SKU isolado

**Espécie-alvo**:
Faceta de um `Product` (`targetSpecies`), não um nível de categoria. Um produto pode servir
a várias espécies ou a nenhuma em particular.
_Avoid_: categoria de espécie

### Autorização

**Feature**:
Uma capacidade nomeada e concedível (`read:user`, `manage:product`).
_Avoid_: permissão, escopo

**Role**:
Um agrupamento de features, definido em código na API e read-only pela interface.
_Avoid_: grupo, cargo, nível de acesso

**Override**:
Ajuste de uma feature pendurado numa **atribuição de role** específica do usuário, que
concede ou nega explicitamente. Nunca pendura no usuário solto.
_Avoid_: permissão customizada, exceção

**Capability efetiva**:
O conjunto que a API computa e devolve em `GET /me`: `(⋃ roles ∪ grants) − denies`, onde
`*` significa "pode tudo". É o que a interface consulta para decidir o que mostrar — nunca
para decidir o que permitir.
_Avoid_: permissões do usuário, acessos
