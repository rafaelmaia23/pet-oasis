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

categoryRouter.post(
  "/categories",
  authenticate,
  canAccess("manage:catalog-structure"),
  categoryController.createCategory,
);

categoryRouter.patch(
  "/categories/:categoryId",
  authenticate,
  canAccess("manage:catalog-structure"),
  categoryController.updateCategory,
);

categoryRouter.delete(
  "/categories/:categoryId",
  authenticate,
  canAccess("manage:catalog-structure"),
  categoryController.deleteCategory,
);

export default categoryRouter;
