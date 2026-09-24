import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { chooseUserView } from "../user.view-resolver";
import * as userProfileController from "./user.profile.controller";

/**
 * As rotas de perfil já sob o `registerRoute`: montadas **sem prefixo**, com o
 * path inteiro vindo da entrada da tabela. Enquanto a migração da issue 11 de
 * `.scratch/fase-12-module-depth/` corre, o que falta fica no
 * `userProfileLegacyRouter` abaixo, ainda montado sob `/users/:userId`.
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

/** O que ainda está na forma antiga — sai quando a última rota migrar. */
export const userProfileLegacyRouter = Router({ mergeParams: true });

userProfileLegacyRouter.post(
  "/employee",
  canAccess(["create:employee-profile", "reactivate:employee-profile"]),
  userProfileController.createEmployeeProfile,
);

export default userProfileRouter;
