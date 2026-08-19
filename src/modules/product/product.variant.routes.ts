import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as variantController from "./product.variant.controller";

/**
 * Recurso plano (`/variants/:variantId`), mesmo racional dos pets: o id é UUID
 * global, e repetir o produto na URL abriria a possibilidade de ele discordar
 * do dono real da variante. A criação, essa sim, é aninhada — mora no
 * `product.routes.ts`, porque precisa do produto na URL.
 *
 * O `PATCH` admite as **duas** features na rota e deixa o service separar campo
 * a campo (X4): o repositor com `manage:stock` ajusta o estoque, o autor com
 * `manage:product` mexe no resto, e o corpo misto exige as duas. Excluir é só
 * autoria — tirar um SKU de circulação não é contagem de prateleira.
 */
const variantRouter = Router();

variantRouter.patch(
  "/:variantId",
  canAccess(["manage:product", "manage:stock"]),
  variantController.updateVariant,
);

variantRouter.delete(
  "/:variantId",
  canAccess("manage:product"),
  variantController.deleteVariant,
);

export default variantRouter;
