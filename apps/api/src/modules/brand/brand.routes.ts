import { routes } from "@pet-oasis/api-contracts/routes";
import type { Request } from "express";
import { Router } from "express";
import {
  catalogIpLimiter,
  rateLimitByIp,
  rateLimitByUser,
  uploadUserLimiter,
} from "@/lib/rateLimit";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import {
  uploadedFile,
  uploadSingleImage,
} from "@/middlewares/upload.middleware";
import * as brandController from "./brand.controller";

/**
 * O que o upload de imagem dá ao handler e a tabela não descreve — o
 * `uploadSingleImage` já garantiu a presença do arquivo em `before`.
 */
function uploadedFileContext(req: Request): { file: Buffer } {
  return { file: uploadedFile(req) };
}

/**
 * Montado **sem prefixo** em `src/routes/index.ts` (issue 13 de
 * `.scratch/fase-12-module-depth/`): o path inteiro vem da tabela, e cada rota
 * declara o que precisa do servidor no próprio `before` — `authenticate` nas
 * de escrita, nada na de leitura (não há ator para identificar: taxonomia não
 * tem view por feature efetiva).
 *
 * A escrita não leva limiter próprio: ela já é estreita por definição — exige
 * `manage:catalog-structure`, que só duas roles têm.
 */
const brandRouter = Router();

registerRoute(brandRouter, routes.brand.list, {
  before: [rateLimitByIp(catalogIpLimiter, "catalog-read")],
  handler: brandController.listBrands,
});

registerRoute(brandRouter, routes.brand.create, {
  before: [authenticate, canAccess("manage:catalog-structure")],
  handler: brandController.createBrand,
});

registerRoute(brandRouter, routes.brand.update, {
  before: [authenticate, canAccess("manage:catalog-structure")],
  handler: brandController.updateBrand,
});

/**
 * Logo (9.10): mesma feature da escrita da marca — `manage:catalog-structure`.
 * Não existe cargo que renomeie a marca mas não possa trocar o logo dela.
 */
registerRoute(brandRouter, routes.brand.setLogo, {
  before: [
    authenticate,
    canAccess("manage:catalog-structure"),
    rateLimitByUser(uploadUserLimiter, "image-upload"),
    uploadSingleImage,
  ],
  context: uploadedFileContext,
  handler: brandController.updateBrandLogo,
});

registerRoute(brandRouter, routes.brand.deleteLogo, {
  before: [authenticate, canAccess("manage:catalog-structure")],
  handler: brandController.deleteBrandLogo,
});

registerRoute(brandRouter, routes.brand.delete, {
  before: [authenticate, canAccess("manage:catalog-structure")],
  handler: brandController.deleteBrand,
});

export default brandRouter;
