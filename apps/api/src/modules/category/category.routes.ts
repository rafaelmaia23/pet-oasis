import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { catalogIpLimiter, rateLimitByIp } from "@/lib/rateLimit";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as categoryController from "./category.controller";

/**
 * Montado **sem prefixo** em `src/routes/index.ts` (issue 13 de
 * `.scratch/fase-12-module-depth/`) — mesmo desenho de marca.
 */
const categoryRouter = Router();

registerRoute(categoryRouter, routes.category.list, {
  before: [rateLimitByIp(catalogIpLimiter, "catalog-read")],
  handler: categoryController.listCategories,
});

registerRoute(categoryRouter, routes.category.create, {
  before: [authenticate, canAccess("manage:catalog-structure")],
  handler: categoryController.createCategory,
});

registerRoute(categoryRouter, routes.category.update, {
  before: [authenticate, canAccess("manage:catalog-structure")],
  handler: categoryController.updateCategory,
});

registerRoute(categoryRouter, routes.category.delete, {
  before: [authenticate, canAccess("manage:catalog-structure")],
  handler: categoryController.deleteCategory,
});

export default categoryRouter;
