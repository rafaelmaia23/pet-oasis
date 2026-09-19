import {
  productImageParamsSchema,
  productImagesParamsSchema,
  reorderProductImagesSchema,
} from "@pet-oasis/api-contracts/catalog";
import type { Request, Response } from "express";
import { uploadedFile } from "@/middlewares/upload.middleware";
import * as imageService from "./product.image.service";
import { productImagePresenter } from "./product.presenter";

/**
 * A resposta do upload é a **imagem criada**, não o produto inteiro (AA12): é o
 * `id` dela que o cliente precisa em seguida para apagar e para reordenar, e
 * devolver o produto o obrigaria a caçar qual das oito é a nova.
 */
export const uploadProductImage = async (req: Request, res: Response) => {
  const { params } = productImagesParamsSchema.parse({ params: req.params });

  const image = await imageService.addImage(
    params.productId,
    uploadedFile(req),
  );

  return res.status(201).json(productImagePresenter.present(image, "default"));
};

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
