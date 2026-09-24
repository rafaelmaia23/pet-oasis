import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
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

/** O que ainda está na forma antiga — sai quando a última rota migrar. */
export const userProfileLegacyRouter = Router({ mergeParams: true });

// A mesma rota cria **ou** reativa (§5.1) — o ramo é decidido pelo estado do
// perfil no banco, então o porteiro tem de admitir quem pode fazer qualquer um
// dos dois. Quem cobra a feature certa para o ramo que de fato correu é o
// service; sem isso, ter só `reactivate:` deixaria criar do zero.
userProfileLegacyRouter.post(
  "/customer",
  canAccess(["create:customer-profile", "reactivate:customer-profile"]),
  userProfileController.createCustomerProfile,
);

userProfileLegacyRouter.post(
  "/employee",
  canAccess(["create:employee-profile", "reactivate:employee-profile"]),
  userProfileController.createEmployeeProfile,
);

userProfileLegacyRouter.delete(
  "/employee",
  canAccess("delete:profile"),
  userProfileController.deleteEmployeeProfile,
);

export default userProfileRouter;
