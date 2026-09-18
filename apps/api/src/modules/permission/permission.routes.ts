import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as permissionController from "./permission.controller";

const permissionRouter = Router({ mergeParams: true });

permissionRouter.get(
  "/features",
  canAccess("read:permission"),
  permissionController.getUserFeatures,
);

permissionRouter.get(
  "/roles",
  canAccess("read:permission"),
  permissionController.getUserRoles,
);

permissionRouter.get(
  "/permissions",
  canAccess("read:permission"),
  permissionController.getUserPermissions,
);

permissionRouter.post(
  "/roles/:roleId",
  canAccess("manage:permission"),
  permissionController.addUserRole,
);

permissionRouter.delete(
  "/roles/:roleId",
  canAccess("manage:permission"),
  permissionController.removeUserRole,
);

// A role vai no path porque a identidade do override é a tripla
// (user, role, feature) — body não identifica recurso (D9).
permissionRouter.put(
  "/roles/:roleId/features/:featureId",
  canAccess("manage:permission"),
  permissionController.upsertUserFeature,
);

permissionRouter.delete(
  "/roles/:roleId/features/:featureId",
  canAccess("manage:permission"),
  permissionController.removeUserFeature,
);

export default permissionRouter;
