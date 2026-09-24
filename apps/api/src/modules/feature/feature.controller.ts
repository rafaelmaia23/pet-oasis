import { featureParamsSchema } from "@pet-oasis/api-contracts/feature";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import { featurePresenter } from "./feature.presenter";
import * as featureService from "./feature.service";

export const getAllFeatures: RouteHandler<
  typeof routes.feature.list
> = async () => {
  // Sem paginação: catálogo de referência limitado (docs/adr/0004-pagination.md).
  const features = await featureService.getAllFeatures();

  return listEnvelope(features);
};

export const getFeatureById = async (req: Request, res: Response) => {
  const { params } = featureParamsSchema.parse({ params: req.params });

  const feature = await featureService.getFeatureById(params.id);

  res.status(200).json(featurePresenter.present(feature, "default"));
};
