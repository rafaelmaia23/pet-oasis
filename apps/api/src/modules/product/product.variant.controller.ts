import {
  createVariantSchema,
  updateVariantSchema,
  variantParamsSchema,
} from "@pet-oasis/api-contracts/catalog";
import type { Request, Response } from "express";
import { getAuthUser } from "@/utils/getAuthUser";
import { variantPresenter } from "./product.presenter";
import * as variantService from "./product.variant.service";

export const createVariant = async (req: Request, res: Response) => {
  const { params, body } = createVariantSchema.parse({
    params: req.params,
    body: req.body,
  });

  const variant = await variantService.createVariant(params.productId, body);

  return res
    .status(201)
    .json(
      variantPresenter.present(
        variant,
        variantService.viewFor(getAuthUser(req)),
      ),
    );
};

export const updateVariant = async (req: Request, res: Response) => {
  const { params, body } = updateVariantSchema.parse({
    params: req.params,
    body: req.body,
  });

  const variant = await variantService.updateVariant(
    getAuthUser(req),
    params.variantId,
    body,
  );

  return res
    .status(200)
    .json(
      variantPresenter.present(
        variant,
        variantService.viewFor(getAuthUser(req)),
      ),
    );
};

export const deleteVariant = async (req: Request, res: Response) => {
  const { params } = variantParamsSchema.parse({ params: req.params });

  await variantService.deleteVariant(params.variantId);

  return res.status(204).send();
};
