import type { routes } from "@pet-oasis/api-contracts/routes";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as featureService from "./feature.service";

export const getAllFeatures: RouteHandler<
  typeof routes.feature.list
> = async () => {
  // Sem paginação: catálogo de referência limitado (docs/adr/0004-pagination.md).
  const features = await featureService.getAllFeatures();

  return listEnvelope(features);
};

export const getFeatureById: RouteHandler<typeof routes.feature.get> = async ({
  params,
}) => featureService.getFeatureById(params.id);
