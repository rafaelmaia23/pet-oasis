import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as roleController from "./role.controller";

// Montado **sem prefixo** em `src/routes/index.ts`: o path inteiro vem da
// tabela, e o `authenticate` que ficava no prefixo é `before` de cada rota.
const roleRouter = Router();

registerRoute(roleRouter, routes.role.list, {
  before: [authenticate, canAccess("read:role")],
  handler: roleController.getAllRoles,
});

registerRoute(roleRouter, routes.role.get, {
  before: [authenticate, canAccess("read:role")],
  handler: roleController.getRoleById,
});

export default roleRouter;
