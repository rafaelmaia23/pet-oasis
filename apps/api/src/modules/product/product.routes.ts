import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import {
  catalogIpLimiter,
  rateLimitByIp,
  rateLimitByUser,
  uploadUserLimiter,
} from "@/lib/rateLimit";
import { registerRoute } from "@/lib/registerRoute";
import { optionalAuthenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { uploadSingleImage } from "@/middlewares/upload.middleware";
import * as productController from "./product.controller";
import * as productImageController from "./product.image.controller";
import * as variantController from "./product.variant.controller";
import {
  chooseProductListView,
  chooseProductReadView,
  chooseProductWriteView,
} from "./product.view-resolver";

/**
 * As rotas de produto já sob o `registerRoute`: montadas **sem prefixo**, com
 * o path inteiro vindo da entrada da tabela. Enquanto a migração da issue 14
 * de `.scratch/fase-12-module-depth/` corre, o que falta fica no
 * `productLegacyRouter` abaixo, ainda montado sob `/products`.
 *
 * Toda escrita de produto e de variante é `manage:product` (9.1) — a exceção é
 * o ajuste de estoque, que mora no `PATCH /variants/:variantId` e é decidido
 * campo a campo pelo service (X4).
 */
const productRouter = Router();

// As duas leituras dividem o balde `catalog-read` com marcas, categorias, tags
// e raças: separar por rota daria N orçamentos ao mesmo scraper.
//
// `optionalAuthenticate` entra em `before` porque a rota é pública (`auth:
// "public"` na tabela) mas a view varia com a feature efetiva do ator quando
// ele existe (9.8) — é o middleware que popula `req.user` antes do dispatch.
registerRoute(productRouter, routes.product.list, {
  before: [
    optionalAuthenticate,
    rateLimitByIp(catalogIpLimiter, "catalog-read"),
  ],
  chooseView: chooseProductListView,
  handler: productController.listProducts,
});

// Vem depois da coleção e antes de tudo que é aninhado: `:idOrSlug` casa com
// qualquer segmento, então uma rota literal registrada abaixo dele nunca seria
// alcançada. Isso não é ordem de registro no Express **aqui** — o path vem
// inteiro da tabela —, mas continua valendo contra o `productLegacyRouter`
// abaixo, que ainda tem rotas literais sob `/:productId`.
registerRoute(productRouter, routes.product.get, {
  before: [
    optionalAuthenticate,
    rateLimitByIp(catalogIpLimiter, "catalog-read"),
  ],
  chooseView: chooseProductReadView,
  handler: productController.getProductByIdOrSlug,
});

// A escrita não tem `authenticate` — nunca teve, aqui: o router inteiro é
// montado com `optionalAuthenticate` (comentário acima), e quem exige
// identidade é o `canAccess`, que responde 401 sozinho sem `req.user`. Trocar
// por `authenticate` mudaria a mensagem do 401 com token inválido (K26), que a
// issue 14 não pode mudar.
registerRoute(productRouter, routes.product.create, {
  before: [optionalAuthenticate, canAccess("manage:product")],
  chooseView: chooseProductWriteView,
  handler: productController.createProduct,
});

/** O que ainda está na forma antiga — sai quando a última rota migrar. */
export const productLegacyRouter = Router();

productLegacyRouter.patch(
  "/:productId",
  canAccess("manage:product"),
  productController.updateProduct,
);

productLegacyRouter.delete(
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
productLegacyRouter.post(
  "/:productId/images",
  canAccess("manage:product"),
  rateLimitByUser(uploadUserLimiter, "image-upload"),
  uploadSingleImage,
  productImageController.uploadProductImage,
);

// Antes do item: `:imageId` casaria com o literal `order` se viessem na ordem
// inversa — mas são métodos diferentes, então isto é higiene, não necessidade.
productLegacyRouter.patch(
  "/:productId/images/order",
  canAccess("manage:product"),
  productImageController.reorderProductImages,
);

productLegacyRouter.delete(
  "/:productId/images/:imageId",
  canAccess("manage:product"),
  productImageController.deleteProductImage,
);

// Coleção aninhada: criar variante precisa do produto na URL. O item é plano
// (`/variants/:variantId`), mesmo racional dos pets — o id é global.
productLegacyRouter.post(
  "/:productId/variants",
  canAccess("manage:product"),
  variantController.createVariant,
);

export default productRouter;
