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

permissionRouter.put(
  "/features/:featureId",
  canAccess("manage:permission"),
  permissionController.upsertUserFeature,
);

permissionRouter.delete(
  "/features/:featureId",
  canAccess("manage:permission"),
  permissionController.removeUserFeature,
);

export default permissionRouter;
