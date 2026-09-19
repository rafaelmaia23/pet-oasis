# Catálogo — quatro cortes, nenhum deles por recurso

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Catálogo de features*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`manage:product` (produto, variante e imagem — variante não existe sem produto),
`manage:catalog-structure` (marca, categoria e tag), `manage:stock` e as duas de leitura acima
do baseline público, `read:product:internal` e `read:product:cost`.

Os cortes seguem cargos, não tabelas. Autoria de catálogo separa-se da **estrutura** porque
reorganizar a árvore de categorias reclassifica a loja inteira, enquanto corrigir a descrição
de um produto não. **Estoque** é feature própria porque quem conta prateleira não é quem
cadastra produto — e porque na Fase 10, quando `StockMovement` chegar, o nome já existe.
**Custo** é próprio porque é o único campo do catálogo com regra social diferente: é ele que a
view por feature efetiva consulta para decidir se `costCents` sai na resposta.
