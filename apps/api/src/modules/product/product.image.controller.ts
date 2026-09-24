import {
  productImageParamsSchema,
  reorderProductImagesSchema,
} from "@pet-oasis/api-contracts/catalog";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import type { RouteHandler } from "@/lib/registerRoute";
import * as imageService from "./product.image.service";
import { productImagePresenter } from "./product.presenter";
import type { ProductTransport } from "./product.transport";

/**
 * A resposta do upload é a **imagem criada**, não o produto inteiro (AA12): é o
 * `id` dela que o cliente precisa em seguida para apagar e para reordenar, e
 * devolver o produto o obrigaria a caçar qual das oito é a nova.
 */
export const uploadProductImage: RouteHandler<
  typeof routes.product.addImage,
  ProductTransport
> = async ({ params, file }) => imageService.addImage(params.productId, file);

export const deleteProductImage = async (req: Request, res: Response) => {
  const { params } = productImageParamsSchema.parse({ params: req.params });

  await imageService.removeImage(params.productId, params.imageId);

  return res.status(204).send();
};

export const reorderProductImages = async (req: Request, res: Response) => {
  const { params, body } = reorderProductImagesSchema.parse({
    params: req.params,
    body: req.body,
  });

  const images = await imageService.reorderImages(
    params.productId,
    body.images,
  );

  return res
    .status(200)
    .json({ data: productImagePresenter.presentMany(images, "default") });
};
