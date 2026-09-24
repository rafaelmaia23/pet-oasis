import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as permissionController from "./permission.controller";

// Montado **sem prefixo** em `src/routes/index.ts`: o path inteiro vem da
// tabela. Por isso não há `mergeParams` — ele existia para que o `:userId` do
// prefixo `/users/:userId` chegasse ao handler, e agora o parâmetro é da
// própria rota.
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

registerRoute(permissionRouter, routes.permission.removeOverride, {
  before: [authenticate, canAccess("manage:permission")],
  handler: permissionController.removeUserFeature,
});

export default permissionRouter;
