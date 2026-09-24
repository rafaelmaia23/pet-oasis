import {
  type ProductView,
  productListLadder,
  productViews,
} from "@pet-oasis/api-contracts/catalog";
import type { AuthUser } from "@/lib/authorization";
import * as productService from "./product.service";

/**
 * Qual degrau da escada de produto (`productReadLadder`/`productWriteLadder`)
 * este ator recebe. A decisão continua sendo do service — `readViewFor` e
 * `viewFor` já a calculam a partir da feature efetiva (`docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md`)
 * —, e o que estas funções fazem é traduzir o degrau (uma string) no schema
 * que a tabela declara, que é o que o `chooseView` do registro precisa
 * devolver. É este ponto — e o equivalente em `product.variant.view-resolver.ts`
 * — que a issue 17 de `.scratch/fase-12-module-depth/` vai encontrar como
 * dono único da correspondência degrau → feature.
 */
export function chooseProductReadView(
  actor: AuthUser | undefined,
): (typeof productViews)[ProductView] {
  return productViews[productService.readViewFor(actor)];
}

/**
 * A escrita nunca devolve o degrau público — quem chega aqui já tem
 * `manage:product` —, então a tradução não pode ser um índice direto em
 * `productViews` (a tabela declara `productWriteLadder`, só `internal`/`cost`).
 */
export function chooseProductWriteView(
  actor: AuthUser,
): typeof productViews.internal | typeof productViews.cost {
  return productService.viewFor(actor) === "cost"
    ? productViews.cost
    : productViews.internal;
}

/**
 * O envelope inteiro de `GET /products` (9.8), não o item: a mesma decisão de
 * `chooseProductReadView`, traduzida para a escada de envelopes que
 * `productListSchemaFor` produz (`packages/api-contracts/src/catalog/product.views.ts`).
 */
const productListViewFor: Record<
  ProductView,
  (typeof productListLadder)[number]
> = {
  public: productListLadder[0],
  internal: productListLadder[1],
  cost: productListLadder[2],
};

export function chooseProductListView(
  actor: AuthUser | undefined,
): (typeof productListLadder)[number] {
  return productListViewFor[productService.readViewFor(actor)];
}
