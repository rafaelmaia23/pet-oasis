import { productImageParamsSchema } from "@pet-oasis/api-contracts/catalog";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import type { RouteHandler } from "@/lib/registerRoute";
import * as imageService from "./product.image.service";
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

/**
 * `{ data }` sai **cru**: a view (`productImageListSchema`, uma view só, sem
 * escada) faz a whitelist do array inteiro no registrador — presentear aqui
 * duplicaria a decisão.
 */
export const reorderProductImages: RouteHandler<
  typeof routes.product.reorderImages
> = async ({ params, body }) => {
  const images = await imageService.reorderImages(
    params.productId,
    body.images,
  );

  return { data: images };
};
