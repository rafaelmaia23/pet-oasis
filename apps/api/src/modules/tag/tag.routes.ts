import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { catalogIpLimiter, rateLimitByIp } from "@/lib/rateLimit";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as tagController from "./tag.controller";

/**
 * Montado **sem prefixo** em `src/routes/index.ts` (issue 13 de
 * `.scratch/fase-12-module-depth/`) — mesmo desenho de marca e categoria.
 */
const tagRouter = Router();

registerRoute(tagRouter, routes.tag.list, {
  before: [rateLimitByIp(catalogIpLimiter, "catalog-read")],
  handler: tagController.listTags,
});

tagRouter.post(
  "/tags",
  authenticate,
  canAccess("manage:catalog-structure"),
  tagController.createTag,
);

tagRouter.patch(
  "/tags/:tagId",
  authenticate,
  canAccess("manage:catalog-structure"),
  tagController.updateTag,
);

tagRouter.delete(
  "/tags/:tagId",
  authenticate,
  canAccess("manage:catalog-structure"),
  tagController.deleteTag,
);

export default tagRouter;
