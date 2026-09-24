import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as featureController from "./feature.controller";

// Montado **sem prefixo** em `src/routes/index.ts`: o path inteiro vem da
// tabela. O que ainda não migrou soletra o path e carrega o `authenticate`
// que antes vinha do prefixo.
const featureRouter = Router();

registerRoute(featureRouter, routes.feature.list, {
  before: [authenticate, canAccess("read:feature")],
  handler: featureController.getAllFeatures,
});

featureRouter.get(
  "/features/:id",
  authenticate,
  canAccess("read:feature"),
  featureController.getFeatureById,
);

export default featureRouter;
