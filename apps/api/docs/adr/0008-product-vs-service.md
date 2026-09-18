# Produto vs. serviço: por que ficam em tabelas separadas

> Decisão de domínio registrada no planejamento da Fase 9, mas **herdada pela
> Fase 10** — nada no schema da Fase 9 muda por causa desta decisão. Registrada
> agora porque o custo de errá-la só aparece na Fase 10, no item do pedido, e
> nesse ponto seria tarde para revisar sem retrabalho.

## O problema

O app, no longo prazo, vende **produtos e serviços** (banho, tosa, consulta).
Quando alguém compra 1 saco de ração e 1 banho no mesmo pedido, o pedido tem
dois itens de naturezas diferentes — e o banco não tem uma FK que aponte para
duas tabelas ao mesmo tempo. Essa pergunta precisa de resposta antes de
`OrderItem` existir (Fase 10), mas a resposta certa depende de como `Product`
já está modelado (Fase 9) — por isso a decisão é tomada agora.

## Decisão ✅

### `Product` e `Service` separados, `OrderItem` polimórfico

Três caminhos foram avaliados:

1. **Tudo é `Product`, com `kind = PRODUCT | SERVICE`.** Item do pedido com FK
   única, carrinho sem ramificação. Custo: serviço não tem peso, estoque,
   variante nem marca; produto não tem duração, profissional executante nem
   pet atendido. A tabela vira metade colunas nulas, e a validação
   "obrigatório se `kind = SERVICE`" migra do banco para o código — uma
   armadilha confortável que parece simples e não é.
2. ✅ **`Product` e `Service` separados, `OrderItem` polimórfico.** Escolhido.
3. **Supertipo `SellableItem` com `Product`/`Service` como subtipos**
   compartilhando a PK (*class table inheritance*). Academicamente o mais
   correto: FK única, sem coluna nula. Custo: uma junção a mais em **toda**
   leitura de catálogo — justamente a parte mais usada do sistema — e duas
   escritas coordenadas em todo cadastro.

A escolha foi a opção 2. Não porque a 3 esteja errada — é mais correta — mas
porque o benefício dela é integridade referencial num ponto só (o `OrderItem`
da Fase 10), e o custo é junção e cerimônia no caminho mais quente do sistema
(toda leitura de `Product`, hoje e sempre).

### O que isso obriga na Fase 10 (não agora)

`OrderItem` ganha `productVariantId` e `serviceId`, ambos **nullable**, com um
**CHECK constraint** garantindo que exatamente um dos dois está preenchido. O
Prisma não declara CHECK — precisa ser SQL escrito à mão na migration.

### O que isso obriga agora

Nada no schema da Fase 9. `Product`/`ProductVariant` nascem exatamente como
descrito em `docs/adr/product-catalog-modeling.md`. O que muda é que a Fase 10
já sabe o formato que `OrderItem` vai ter, e não precisa reabrir esta discussão
quando chegar lá.

## Alternativas consideradas

- **`kind` único em `Product`:** FK única e carrinho simples, mas tabela
  half-null e validação condicional fora do banco. Preterido — ver acima.
- **Supertipo com PK compartilhada:** mais correto, mas junção a mais em toda
  leitura de catálogo. Preterido — o custo recorrente supera o benefício
  concentrado num ponto só.
- **Sem serviço nesta modelagem, decidir só na Fase 10:** rejeitado
  explicitamente — o custo de errar apareceria só no item do pedido, quando o
  formato de `Product` já estaria fixado e uma correção seria retrabalho
  espalhado.

## Quando revisitar

- Se o catálogo de produtos crescer a ponto de a leitura mais quente do
  sistema deixar de ser `Product` sozinho (ex.: sempre lido junto com
  `Service` numa vitrine combinada): reconsiderar o supertipo com dado real de
  padrão de acesso, não hipotético.
- Quando a Fase 10 implementar `OrderItem`: confirmar que o CHECK constraint
  escrito à mão sobrevive a `prisma migrate dev` sem ser sobrescrito (Prisma
  não conhece constraints que não declarou).
