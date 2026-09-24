import { variantWriteLadder } from "@pet-oasis/api-contracts/catalog";
import type { AuthUser } from "@/lib/authorization";
import { chooseView } from "@/lib/viewLadder";

/**
 * O equivalente, para variante, de `chooseProductWriteView`
 * (`product.view-resolver.ts`): sobre os mesmos pares (degrau, feature), agora
 * de `variantWriteLadder`.
 */
export function chooseVariantWriteView(actor: AuthUser) {
  return chooseView(variantWriteLadder, actor);
}
