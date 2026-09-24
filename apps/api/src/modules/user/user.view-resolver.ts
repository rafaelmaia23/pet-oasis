import { userViewLadder } from "@pet-oasis/api-contracts/user";
import type { AuthUser } from "@/lib/authorization";
import { chooseView } from "@/lib/viewLadder";

/**
 * Qual degrau da escada de usuário (`userViewLadder`) este ator recebe: quem
 * tem `read:user:others` vê a resposta administrativa — roles e overrides —, e
 * quem não tem vê o que o dono vê de si.
 *
 * A escada é **declarada** no contrato, em pares (degrau, feature), e
 * **decidida** aqui por `chooseView`
 * (`docs/adr/0204-escada-declara-par-passo-feature-contrato-continua-so-declarando.md`);
 * é esta função que o registro de cada rota de usuário e de perfil passa em
 * `chooseView` do registrador.
 */
export function chooseUserView(viewer: AuthUser) {
  return chooseView(userViewLadder, viewer);
}
