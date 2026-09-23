import { Router } from "express";
import { catalogIpLimiter, rateLimitByIp } from "@/lib/rateLimit";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as categoryController from "./category.controller";

// Leitura pública, escrita sob `manage:catalog-structure` — mesmo desenho dos
// módulos de marca e tag. Montado com `optionalAuthenticate` em
// `src/routes/index.ts`.
const categoryRouter = Router();

categoryRouter.get(
  "/",
  rateLimitByIp(catalogIpLimiter, "catalog-read"),
  categoryController.listCategories,
);

categoryRouter.post(
  "/",
  canAccess("manage:catalog-structure"),
  categoryController.createCategory,
);

categoryRouter.patch(
  "/:categoryId",
  canAccess("manage:catalog-structure"),
  categoryController.updateCategory,
);

categoryRouter.delete(
  "/:categoryId",
  canAccess("manage:catalog-structure"),
  categoryController.deleteCategory,
);

export default categoryRouter;
