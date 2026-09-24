import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as userController from "./user.controller";
import { chooseUserView } from "./user.view-resolver";

/**
 * As rotas de usuário, montadas **sem prefixo**: o path inteiro vem da entrada
 * da tabela, e o `authenticate` que ficava no prefixo desceu para o `before` de
 * cada uma.
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

registerRoute(userRouter, routes.user.update, {
  before: [authenticate, canAccess("update:user")],
  chooseView: chooseUserView,
  handler: userController.updateUser,
});

registerRoute(userRouter, routes.user.create, {
  before: [authenticate, canAccess("create:user")],
  chooseView: chooseUserView,
  handler: userController.createEmployee,
});

export default userRouter;
