import { Router } from "express";
import { catalogIpLimiter, rateLimitByIp } from "@/lib/rateLimit";
import { canAccess } from "@/middlewares/canAccess.middleware";
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

brandRouter.delete(
  "/:brandId",
  canAccess("manage:catalog-structure"),
  brandController.deleteBrand,
);

export default brandRouter;
