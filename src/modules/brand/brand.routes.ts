import { Router } from "express";
import {
  catalogIpLimiter,
  rateLimitByIp,
  rateLimitByUser,
  uploadUserLimiter,
} from "@/lib/rateLimit";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { uploadSingleImage } from "@/middlewares/upload.middleware";
import * as brandController from "./brand.controller";

/**
 * Primeiro módulo do projeto com leitura **pública** e escrita protegida no
 * mesmo router (9.6). É por isso que a montagem usa `optionalAuthenticate` em
 * vez de `authenticate` (ver `src/routes/index.ts`): o `GET` precisa responder
 * ao visitante sem conta, e quem exige identidade no resto é o `canAccess`, que
 * já devolve 401 sozinho quando `req.user` falta.
 *
 * A escrita não leva limiter próprio: ela já é estreita por definição — exige
 * `manage:catalog-structure`, que só duas roles têm.
 */
const brandRouter = Router();

brandRouter.get(
  "/",
  rateLimitByIp(catalogIpLimiter, "catalog-read"),
  brandController.listBrands,
);

brandRouter.post(
  "/",
  canAccess("manage:catalog-structure"),
  brandController.createBrand,
);

brandRouter.patch(
  "/:brandId",
  canAccess("manage:catalog-structure"),
  brandController.updateBrand,
);

/**
 * Logo (9.10): mesma feature da escrita da marca — `manage:catalog-structure`.
 * Não existe cargo que renomeie a marca mas não possa trocar o logo dela.
 */
brandRouter.put(
  "/:brandId/logo",
  canAccess("manage:catalog-structure"),
  rateLimitByUser(uploadUserLimiter, "image-upload"),
  uploadSingleImage,
  brandController.updateBrandLogo,
);

brandRouter.delete(
  "/:brandId/logo",
  canAccess("manage:catalog-structure"),
  brandController.deleteBrandLogo,
);

brandRouter.delete(
  "/:brandId",
  canAccess("manage:catalog-structure"),
  brandController.deleteBrand,
);

export default brandRouter;
