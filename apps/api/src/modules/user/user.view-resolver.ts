import { type UserView, userViews } from "@pet-oasis/api-contracts/user";
import type { z } from "zod";
import type { AuthUser } from "@/lib/authorization";
import { hasFeature } from "@/lib/authorization";

/**
 * Qual degrau da escada de usuário (`userViewLadder`) este ator recebe: quem
 * tem `read:user:others` vê a resposta administrativa — roles e overrides —, e
 * quem não tem vê o que o dono vê de si.
 *
 * A escada é **declarada** no contrato e **decidida** aqui
 * (`docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md`); é
 * esta função que o registro de cada rota de usuário passa em `chooseView`.
 * Dar um dono à correspondência degrau → feature — hoje esta linha, e o
 * equivalente dela em produto e variante — é a issue 17 de
 * `.scratch/fase-12-module-depth/`.
 */
export function chooseUserView(viewer: AuthUser): z.ZodType {
  return userViews[resolveUserView(viewer)];
}

/**
 * A mesma decisão, pelo **nome** da view: é o que o `userPresenter` pede, e o
 * que as rotas de usuário ainda na forma antiga usam. Sai junto com a última
 * delas (issue 11 de `.scratch/fase-12-module-depth/`).
 */
export function resolveUserView(viewer: AuthUser): UserView {
  if (hasFeature(viewer, "read:user:others")) return "admin";
  return "owner";
}
