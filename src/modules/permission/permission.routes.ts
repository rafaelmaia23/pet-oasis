import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as permissionController from "./permission.controller";

const permissionRouter = Router({ mergeParams: true });

permissionRouter.get(
  "/features",
  canAccess("read:feature"),
  permissionController.getUserFeatures,
);
permissionRouter.post(
  "/features/:featureId",
  canAccess("manage:feature"),
  permissionController.assignFeatureToUser,
);
permissionRouter.delete(
  "/features/:featureId",
  canAccess("manage:feature"),
  permissionController.removeFeatureFromUser,
);

export default permissionRouter;
