import { Router } from "express";
import {
  catalogIpLimiter,
  rateLimitByIp,
  rateLimitByUser,
  uploadUserLimiter,
} from "@/lib/rateLimit";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { uploadSingleImage } from "@/middlewares/upload.middleware";
import * as productController from "./product.controller";
import * as productImageController from "./product.image.controller";
import * as variantController from "./product.variant.controller";

/**
 * Leitura pública e escrita protegida no mesmo router, como marca e categoria
 * (9.6). O router é montado com `optionalAuthenticate` em `src/routes/index.ts`
 * — os dois `GET` respondem sem token e escolhem a view pela capability do ator
 * (9.8), e quem exige identidade no resto é o `canAccess`, que devolve 401
 * sozinho sem `req.user`.
 *
 * Toda escrita de produto e de variante é `manage:product` (9.1) — a exceção é
 * o ajuste de estoque, que mora no `PATCH /variants/:variantId` e é decidido
 * campo a campo pelo service (X4).
 */
const productRouter = Router();

// As duas leituras dividem o balde `catalog-read` com marcas, categorias, tags
// e raças: separar por rota daria N orçamentos ao mesmo scraper.
productRouter.get(
  "/",
  rateLimitByIp(catalogIpLimiter, "catalog-read"),
  productController.listProducts,
);

// Vem depois da coleção e antes de tudo que é aninhado: `:idOrSlug` casa com
// qualquer segmento, então uma rota literal registrada abaixo dele nunca seria
// alcançada.
productRouter.get(
  "/:idOrSlug",
  rateLimitByIp(catalogIpLimiter, "catalog-read"),
  productController.getProductByIdOrSlug,
);

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

/**
 * Imagens (9.10). O item é **aninhado** (`/products/:productId/images/:imageId`)
 * e não plano como a variante: `/images/:id` reservaria um substantivo genérico
 * para algo que só serve a produto — foto de pet e logo de marca não são
 * `Image`, são coluna do dono. O preço do aninhamento é o descasamento
 * `productId` × dono real, que o service resolve com 404 (AA11).
 *
 * A ordem dos middlewares é deliberada: `canAccess` **antes** do limiter, para
 * que quem não pode subir imagem receba 401/403 sem consumir cota de balde
 * nenhum; e o limiter antes do multer, para que a cota seja cobrada antes de o
 * corpo inteiro ser lido para a memória.
 */
productRouter.post(
  "/:productId/images",
  canAccess("manage:product"),
  rateLimitByUser(uploadUserLimiter, "image-upload"),
  uploadSingleImage,
  productImageController.uploadProductImage,
);

// Antes do item: `:imageId` casaria com o literal `order` se viessem na ordem
// inversa — mas são métodos diferentes, então isto é higiene, não necessidade.
productRouter.patch(
  "/:productId/images/order",
  canAccess("manage:product"),
  productImageController.reorderProductImages,
);

productRouter.delete(
  "/:productId/images/:imageId",
  canAccess("manage:product"),
  productImageController.deleteProductImage,
);

// Coleção aninhada: criar variante precisa do produto na URL. O item é plano
// (`/variants/:variantId`), mesmo racional dos pets — o id é global.
productRouter.post(
  "/:productId/variants",
  canAccess("manage:product"),
  variantController.createVariant,
);

export default productRouter;
