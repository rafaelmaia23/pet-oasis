# A vitrine do catálogo responde sem token (9.1)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Superfície pública*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`GET /products`, `GET /products/:idOrSlug`, `/categories`, `/brands`, `/tags` e `/breeds` são
**públicas**. O motivo é o produto, não a técnica: o e-commerce vive de alguém buscar "ração" no
Google, cair na página do produto sem conta nenhuma e decidir se compra. Login entra só no
carrinho, na Fase 10. Toda a escrita e todas as rotas de pet continuam autenticadas.

Três consequências, todas herdadas pelas sessões 9.6/9.8:

1. **Nasceu uma autenticação opcional** (implementada na 9.6). `authenticate` era tudo-ou-nada:
   tolerava header ausente, mas token malformado ou expirado ainda virava 401. A vitrine precisa de
   um terceiro comportamento — se vier `Bearer`, identifica o ator; se não vier **ou se o token for
   ruim**, segue anônimo e nunca responde 401. É isso que faz o mesmo `GET /products` devolver a
   view pública ao visitante e a interna a quem tem `read:product:internal`. Detalhe do desenho em
   [architecture.md](0097-optionalauthenticate-terceiro-modo-vitrine-publica.md).
2. **Não existe feature de leitura pública de catálogo.** Não há o que conceder ao cliente para
   ele ver produto — a role `customer` sai da Fase 9 só com as features de pet. O sufixo
   `:internal` já significa "acima do baseline", e o baseline aqui é o anônimo.
3. **Rate limit e cache são por IP, sem identidade.** (O limite entrou na 9.6: balde único
   `catalog-read` para as quatro leituras públicas — separar por rota daria N orçamentos a um
   scraper pelo preço de um.) É a primeira leitura em volume do projeto
   sem ator; o Redis já está disponível para as duas coisas.

A view pública é à prova de vazamento **por definição** (whitelist do presenter), não por
permissão: sem `costCents`, sem `stockQuantity` exato — disponibilidade como booleano derivado — e
sem produto `DRAFT`/`DISCONTINUED`.
