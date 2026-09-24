import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as permissionController from "./permission.controller";

// Montado **sem prefixo** em `src/routes/index.ts`: o path inteiro vem da
// tabela. Por isso o `mergeParams` saiu — ele existia para que `:userId` do
// prefixo `/users/:userId` chegasse ao handler, e agora o parâmetro é da
// própria rota. Enquanto a issue 09 migra uma rota por commit, o que ainda
// está na forma antiga soletra o path inteiro e carrega o `authenticate` que
// antes vinha do prefixo.
const permissionRouter = Router();

registerRoute(permissionRouter, routes.permission.listFeatures, {
  before: [authenticate, canAccess("read:permission")],
  handler: permissionController.getUserFeatures,
});

registerRoute(permissionRouter, routes.permission.listRoles, {
  before: [authenticate, canAccess("read:permission")],
  handler: permissionController.getUserRoles,
});

registerRoute(permissionRouter, routes.permission.listEffectiveFeatures, {
  before: [authenticate, canAccess("read:permission")],
  handler: permissionController.getUserPermissions,
});

registerRoute(permissionRouter, routes.permission.assignRole, {
  before: [authenticate, canAccess("manage:permission")],
  handler: permissionController.addUserRole,
});

registerRoute(permissionRouter, routes.permission.revokeRole, {
  before: [authenticate, canAccess("manage:permission")],
  handler: permissionController.removeUserRole,
});

// A role vai no path porque a identidade do override é a tripla
// (user, role, feature) — body não identifica recurso (D9).
registerRoute(permissionRouter, routes.permission.upsertOverride, {
  before: [authenticate, canAccess("manage:permission")],
  handler: permissionController.upsertUserFeature,
});

permissionRouter.delete(
  "/users/:userId/roles/:roleId/features/:featureId",
  authenticate,
  canAccess("manage:permission"),
  permissionController.removeUserFeature,
);

export default permissionRouter;
