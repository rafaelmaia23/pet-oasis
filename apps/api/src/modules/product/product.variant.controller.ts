import { variantParamsSchema } from "@pet-oasis/api-contracts/catalog";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import type { RouteHandler } from "@/lib/registerRoute";
import * as variantService from "./product.variant.service";

export const createVariant: RouteHandler<
  typeof routes.variant.create
> = async ({ params, body }) =>
  variantService.createVariant(params.productId, body);

export const updateVariant: RouteHandler<
  typeof routes.variant.update
> = async ({ params, body, actor }) =>
  variantService.updateVariant(actor, params.variantId, body);

export const deleteVariant = async (req: Request, res: Response) => {
  const { params } = variantParamsSchema.parse({ params: req.params });

  await variantService.deleteVariant(params.variantId);

  return res.status(204).send();
};
