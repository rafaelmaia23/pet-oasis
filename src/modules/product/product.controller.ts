import type { Request, Response } from "express";
import { getAuthUser } from "@/utils/getAuthUser";
import { productPresenter } from "./product.presenter";
import {
  createProductSchema,
  productParamsSchema,
  updateProductSchema,
} from "./product.schema";
import * as productService from "./product.service";

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
