import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as variantController from "./product.variant.controller";
import { chooseVariantWriteView } from "./product.variant.view-resolver";

/**
 * Recurso plano (`/variants/:variantId`), mesmo racional dos pets: o id é UUID
 * global, e repetir o produto na URL abriria a possibilidade de ele discordar
 * do dono real da variante. A criação, essa sim, é aninhada — mora em
 * `product.routes.ts`, porque precisa do produto na URL.
 *
 * O `PATCH` admite as **duas** features na rota e deixa o service separar campo
 * a campo (X4): o repositor com `manage:stock` ajusta o estoque, o autor com
 * `manage:product` mexe no resto, e o corpo misto exige as duas. Excluir é só
 * autoria — tirar um SKU de circulação não é contagem de prateleira.
 *
 * Montado **sem prefixo** em `src/routes/index.ts`: o path inteiro vem da
 * tabela, e o `authenticate` que ficava no prefixo desceu para o `before` de
 * cada rota (issue 14 de `.scratch/fase-12-module-depth/`).
 */
const variantRouter = Router();

registerRoute(variantRouter, routes.variant.update, {
  before: [authenticate, canAccess(["manage:product", "manage:stock"])],
  chooseView: chooseVariantWriteView,
  handler: variantController.updateVariant,
});

registerRoute(variantRouter, routes.variant.delete, {
  before: [authenticate, canAccess("manage:product")],
  handler: variantController.deleteVariant,
});

export default variantRouter;
