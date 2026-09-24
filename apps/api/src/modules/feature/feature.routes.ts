import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as featureController from "./feature.controller";

// Montado **sem prefixo** em `src/routes/index.ts`: o path inteiro vem da
// tabela, e o `authenticate` que ficava no prefixo é `before` de cada rota.
const featureRouter = Router();

registerRoute(featureRouter, routes.feature.list, {
  before: [authenticate, canAccess("read:feature")],
  handler: featureController.getAllFeatures,
});

registerRoute(featureRouter, routes.feature.get, {
  before: [authenticate, canAccess("read:feature")],
  handler: featureController.getFeatureById,
});

export default featureRouter;
