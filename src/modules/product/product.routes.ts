import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as productController from "./product.controller";
import * as variantController from "./product.variant.controller";

/**
 * Só escrita nesta fase (9.7) — a leitura (`GET /products`, detalhe, filtros e
 * views por capability) é da 9.8. O router já é montado com
 * `optionalAuthenticate` em `src/routes/index.ts`, como marcas e categorias,
 * para que a vitrine da 9.8 seja acréscimo e não remontagem; quem exige
 * identidade aqui é o `canAccess`, que devolve 401 sozinho sem `req.user`.
 *
 * Toda escrita de produto e de variante é `manage:product` (9.1) — a exceção é
 * o ajuste de estoque, que mora no `PATCH /variants/:variantId` e é decidido
 * campo a campo pelo service (X4).
 */
const productRouter = Router();

productRouter.post(
  "/",
  canAccess("manage:product"),
  productController.createProduct,
);

productRouter.patch(
  "/:productId",
  canAccess("manage:product"),
  productController.updateProduct,
);

productRouter.delete(
  "/:productId",
  canAccess("manage:product"),
  productController.deleteProduct,
);

// Coleção aninhada: criar variante precisa do produto na URL. O item é plano
// (`/variants/:variantId`), mesmo racional dos pets — o id é global.
productRouter.post(
  "/:productId/variants",
  canAccess("manage:product"),
  variantController.createVariant,
);

export default productRouter;
