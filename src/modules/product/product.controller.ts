import type { Request, Response } from "express";
import { offsetEnvelope } from "@/lib/pagination";
import { getAuthUser } from "@/utils/getAuthUser";
import { productListPresenter, productPresenter } from "./product.presenter";
import {
  createProductSchema,
  listProductsSchema,
  productDetailParamsSchema,
  productParamsSchema,
  updateProductSchema,
} from "./product.schema";
import * as productService from "./product.service";

/**
 * As duas leituras lêem `req.user` **direto**, e nunca por `getAuthUser`: a
 * rota é montada com `optionalAuthenticate` (9.6) e `getAuthUser` joga 401 sem
 * ator — que é exatamente o que a vitrine não pode fazer.
 */
export const listProducts = async (req: Request, res: Response) => {
  const { query } = listProductsSchema.parse({ query: req.query });

  const { products, total, search } = await productService.getProducts(
    req.user,
    query,
  );

  const envelope = offsetEnvelope(
    // Presenter da **lista** (9.10/AA14): mesmas três chaves de capability, mas
    // a imagem sai como capa em vez de coleção.
    productListPresenter.presentMany(
      products,
      productService.readViewFor(req.user),
    ),
    query,
    total,
  );

  // `meta.search` só existe quando veio `?q=` (9.9/Z15). O envelope de
  // paginação continua idêntico em todas as listagens do projeto — o que a
  // busca acrescenta é conteúdo **desta** resposta, não mecânica de paginação.
  return res
    .status(200)
    .json(
      search === undefined
        ? envelope
        : { ...envelope, meta: { ...envelope.meta, search } },
    );
};

export const getProductByIdOrSlug = async (req: Request, res: Response) => {
  const { params } = productDetailParamsSchema.parse({ params: req.params });

  const product = await productService.getProductByIdOrSlug(
    req.user,
    params.idOrSlug,
  );

  return res
    .status(200)
    .json(
      productPresenter.present(product, productService.readViewFor(req.user)),
    );
};

export const createProduct = async (req: Request, res: Response) => {
  const { body } = createProductSchema.parse({ body: req.body });

  const product = await productService.createProduct(body);

  return res
    .status(201)
    .json(
      productPresenter.present(
        product,
        productService.viewFor(getAuthUser(req)),
      ),
    );
};

export const updateProduct = async (req: Request, res: Response) => {
  const { params, body } = updateProductSchema.parse({
    params: req.params,
    body: req.body,
  });

  const product = await productService.updateProduct(params.productId, body);

  return res
    .status(200)
    .json(
      productPresenter.present(
        product,
        productService.viewFor(getAuthUser(req)),
      ),
    );
};

export const deleteProduct = async (req: Request, res: Response) => {
  const { params } = productParamsSchema.parse({ params: req.params });

  await productService.deleteProduct(params.productId);

  return res.status(204).send();
};
