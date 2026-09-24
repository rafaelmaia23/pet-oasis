import { productParamsSchema } from "@pet-oasis/api-contracts/catalog";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { offsetEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as productService from "./product.service";

/**
 * `data` sai **cru** (o que `flattenProduct` produz): é a view escolhida pelo
 * registrador (`chooseProductListView`) que faz a whitelist do array inteiro,
 * item a item — presentear aqui duplicaria a decisão.
 */
export const listProducts: RouteHandler<typeof routes.product.list> = async ({
  query,
  actor,
}) => {
  const { products, total, search } = await productService.getProducts(
    actor,
    query,
  );

  const envelope = offsetEnvelope(products, query, total);

  // `meta.search` só existe quando veio `?q=` (9.9/Z15). O envelope de
  // paginação continua idêntico em todas as listagens do projeto — o que a
  // busca acrescenta é conteúdo **desta** resposta, não mecânica de paginação.
  return search === undefined
    ? envelope
    : { ...envelope, meta: { ...envelope.meta, search } };
};

export const getProductByIdOrSlug: RouteHandler<
  typeof routes.product.get
> = async ({ params, actor }) =>
  productService.getProductByIdOrSlug(actor, params.idOrSlug);

export const createProduct: RouteHandler<
  typeof routes.product.create
> = async ({ body }) => productService.createProduct(body);

export const updateProduct: RouteHandler<
  typeof routes.product.update
> = async ({ params, body }) =>
  productService.updateProduct(params.productId, body);

export const deleteProduct = async (req: Request, res: Response) => {
  const { params } = productParamsSchema.parse({ params: req.params });

  await productService.deleteProduct(params.productId);

  return res.status(204).send();
};
