import { userViews } from "@pet-oasis/api-contracts/user";
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
 * esta função que o registro de cada rota de usuário e de perfil passa em
 * `chooseView`. Dar um dono à correspondência degrau → feature — hoje esta
 * linha, e o equivalente dela em produto e variante — é a issue 17 de
 * `.scratch/fase-12-module-depth/`.
 */
export function chooseUserView(viewer: AuthUser): z.ZodType {
  return hasFeature(viewer, "read:user:others")
    ? userViews.admin
    : userViews.owner;
}
