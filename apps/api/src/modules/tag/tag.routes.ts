import { Router } from "express";
import { catalogIpLimiter, rateLimitByIp } from "@/lib/rateLimit";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as tagController from "./tag.controller";

// Leitura pública, escrita sob `manage:catalog-structure` — mesmo desenho do
// módulo de marca. Montado com `optionalAuthenticate` em `src/routes/index.ts`.
const tagRouter = Router();

tagRouter.get(
  "/",
  rateLimitByIp(catalogIpLimiter, "catalog-read"),
  tagController.listTags,
);

tagRouter.post(
  "/",
  canAccess("manage:catalog-structure"),
  tagController.createTag,
);

tagRouter.patch(
  "/:tagId",
  canAccess("manage:catalog-structure"),
  tagController.updateTag,
);

tagRouter.delete(
  "/:tagId",
  canAccess("manage:catalog-structure"),
  tagController.deleteTag,
);

export default tagRouter;
