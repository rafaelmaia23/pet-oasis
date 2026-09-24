import {
  productListLadder,
  productReadLadder,
  productWriteLadder,
} from "@pet-oasis/api-contracts/catalog";
import type { AuthUser } from "@/lib/authorization";
import { chooseView } from "@/lib/viewLadder";

/**
 * Qual degrau de cada escada de produto este ator recebe — leitura, escrita e
 * o envelope de listagem, cada uma sobre os pares (degrau, feature) que
 * `packages/api-contracts/src/catalog/product.views.ts` declara
 * (`docs/adr/0204-escada-declara-par-passo-feature-contrato-continua-so-declarando.md`).
 * As três chamam o mesmo `chooseView` — é o ponto único que a issue 17 de
 * `.scratch/fase-12-module-depth/` deu à correspondência degrau → feature,
 * onde antes cada escada (e o equivalente em
 * `product.variant.view-resolver.ts`) reescrevia a tradução.
 */
export function chooseProductReadView(actor: AuthUser | undefined) {
  return chooseView(productReadLadder, actor);
}

/**
 * A escrita nunca devolve o degrau público — quem chega aqui já tem
 * `manage:product` —, o que a própria `productWriteLadder` já expressa: seu
 * degrau base é `internal`, não `public`.
 */
export function chooseProductWriteView(actor: AuthUser) {
  return chooseView(productWriteLadder, actor);
}

/**
 * O envelope inteiro de `GET /products` (9.8), não o item: a mesma feature de
 * `chooseProductReadView`, sobre a escada de envelopes que
 * `productListSchemaFor` produz (`packages/api-contracts/src/catalog/product.views.ts`).
 */
export function chooseProductListView(actor: AuthUser | undefined) {
  return chooseView(productListLadder, actor);
}
