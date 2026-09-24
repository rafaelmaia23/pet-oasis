import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { chooseUserView } from "../user.view-resolver";
import * as userProfileController from "./user.profile.controller";

/**
 * As rotas de perfil, montadas **sem prefixo**: o path inteiro vem da entrada
 * da tabela, e o `authenticate` que ficava no prefixo desceu para o `before` de
 * cada uma. O `mergeParams` saiu junto — o `:userId` já está no path declarado.
 */
const userProfileRouter = Router();

registerRoute(userProfileRouter, routes.profile.deleteCustomer, {
  before: [authenticate, canAccess("delete:profile")],
  handler: userProfileController.deleteCustomerProfile,
});

registerRoute(userProfileRouter, routes.profile.deleteEmployee, {
  before: [authenticate, canAccess("delete:profile")],
  handler: userProfileController.deleteEmployeeProfile,
});

// A mesma rota cria **ou** reativa (§5.1) — o ramo é decidido pelo estado do
// perfil no banco, então o porteiro tem de admitir quem pode fazer qualquer um
// dos dois. Quem cobra a feature certa para o ramo que de fato correu é o
// service; sem isso, ter só `reactivate:` deixaria criar do zero.
registerRoute(userProfileRouter, routes.profile.createCustomer, {
  before: [
    authenticate,
    canAccess(["create:customer-profile", "reactivate:customer-profile"]),
  ],
  chooseView: chooseUserView,
  handler: userProfileController.createCustomerProfile,
});

registerRoute(userProfileRouter, routes.profile.createEmployee, {
  before: [
    authenticate,
    canAccess(["create:employee-profile", "reactivate:employee-profile"]),
  ],
  chooseView: chooseUserView,
  handler: userProfileController.createEmployeeProfile,
});

export default userProfileRouter;
