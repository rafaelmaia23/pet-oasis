import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as featureController from "./feature.controller";

const featureRouter = Router();

featureRouter.get(
  "/",
  canAccess("read:feature"),
  featureController.getAllFeatures,
);
featureRouter.get(
  "/:id",
  canAccess("read:feature"),
  featureController.getFeatureById,
);

export default featureRouter;
