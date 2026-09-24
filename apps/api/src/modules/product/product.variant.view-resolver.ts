import { variantViews } from "@pet-oasis/api-contracts/catalog";
import type { AuthUser } from "@/lib/authorization";
import * as variantService from "./product.variant.service";

/**
 * O equivalente, para variante, de `chooseProductWriteView`
 * (`product.view-resolver.ts`): a tabela declara `variantWriteLadder`
 * (`internal`/`cost`, sem o degrau público — quem escreve já tem
 * `manage:product`), e esta função traduz a decisão do service
 * (`variantService.viewFor`) no schema que o `chooseView` do registro precisa
 * devolver.
 */
export function chooseVariantWriteView(
  actor: AuthUser,
): typeof variantViews.internal | typeof variantViews.cost {
  return variantService.viewFor(actor) === "cost"
    ? variantViews.cost
    : variantViews.internal;
}
