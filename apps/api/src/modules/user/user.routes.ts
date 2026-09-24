import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as userController from "./user.controller";
import { chooseUserView } from "./user.view-resolver";

/**
 * As rotas de usuário já sob o `registerRoute`: montadas **sem prefixo**, com o
 * path inteiro vindo da entrada da tabela. Enquanto a migração da issue 11 de
 * `.scratch/fase-12-module-depth/` corre, o que falta fica no
 * `userLegacyRouter` abaixo, ainda montado sob `/users`.
 */
const userRouter = Router();

registerRoute(userRouter, routes.user.list, {
  before: [authenticate, canAccess("read:user:others")],
  handler: userController.getAllUsers,
});

registerRoute(userRouter, routes.user.delete, {
  before: [authenticate, canAccess("delete:user")],
  handler: userController.deleteUser,
});

registerRoute(userRouter, routes.user.ban, {
  before: [authenticate, canAccess("manage:user:status")],
  handler: userController.banUser,
});

registerRoute(userRouter, routes.user.unban, {
  before: [authenticate, canAccess("manage:user:status")],
  handler: userController.unbanUser,
});

registerRoute(userRouter, routes.user.unlock, {
  before: [authenticate, canAccess("manage:user:status")],
  handler: userController.unlockAccount,
});

registerRoute(userRouter, routes.user.reactivate, {
  before: [authenticate, canAccess("reactivate:user")],
  handler: userController.reactivateAccount,
});

registerRoute(userRouter, routes.user.forcePasswordReset, {
  before: [authenticate, canAccess("manage:user:status")],
  handler: userController.forcePasswordReset,
});

registerRoute(userRouter, routes.user.get, {
  before: [authenticate, canAccess("read:user")],
  chooseView: chooseUserView,
  handler: userController.getUserById,
});

/** O que ainda está na forma antiga — sai quando a última rota migrar. */
export const userLegacyRouter = Router();

userLegacyRouter.post(
  "/",
  canAccess("create:user"),
  userController.createEmployee,
);
userLegacyRouter.patch(
  "/:id",
  canAccess("update:user"),
  userController.updateUser,
);

export default userRouter;
