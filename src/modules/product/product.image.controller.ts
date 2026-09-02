import type { Request, Response } from "express";
import { createValidationError } from "@/errors";
import {
  productImageParamsSchema,
  productImagesParamsSchema,
  reorderProductImagesSchema,
} from "./product.image.schema";
import * as imageService from "./product.image.service";
import { productImagePresenter } from "./product.presenter";

/**
 * A resposta do upload é a **imagem criada**, não o produto inteiro (AA12): é o
 * `id` dela que o cliente precisa em seguida para apagar e para reordenar, e
 * devolver o produto o obrigaria a caçar qual das oito é a nova.
 */
export const uploadProductImage = async (req: Request, res: Response) => {
  const { params } = productImagesParamsSchema.parse({ params: req.params });

  // O middleware de upload já garante a presença; esta guarda é o que reconcilia
  // o `Express.Multer.File | undefined` do tipo com o invariante da rota.
  if (!req.file) {
    throw createValidationError({
      errors: { file: ['Envie um arquivo no campo "file"'] },
    });
  }

  const image = await imageService.addImage(params.productId, req.file.buffer);

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
