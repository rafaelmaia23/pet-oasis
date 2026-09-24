import type { routes } from "@pet-oasis/api-contracts/routes";
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

export const deleteVariant: RouteHandler<
  typeof routes.variant.delete
> = async ({ params }) => {
  await variantService.deleteVariant(params.variantId);
};
