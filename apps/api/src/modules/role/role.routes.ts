import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as roleController from "./role.controller";

// O router é montado **sem prefixo** em `src/routes/index.ts`: o path inteiro
// vem da tabela. Enquanto a issue 09 migra uma rota por commit, o que ainda
// está na forma antiga soletra o path inteiro aqui e carrega o `authenticate`
// que antes vinha do prefixo.
const roleRouter = Router();

registerRoute(roleRouter, routes.role.list, {
  before: [authenticate, canAccess("read:role")],
  handler: roleController.getAllRoles,
});

roleRouter.get(
  "/roles/:id",
  authenticate,
  canAccess("read:role"),
  roleController.getRoleById,
);

export default roleRouter;
