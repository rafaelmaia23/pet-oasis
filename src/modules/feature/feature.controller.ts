import type { Request, Response } from "express";
import { featurePresenter } from "./feature.presenter";
import { featureParamsSchema } from "./feature.schema";
import * as featureService from "./feature.service";

export const getAllFeatures = async (_req: Request, res: Response) => {
  const features = await featureService.getAllFeatures();

  res.status(200).json(featurePresenter.presentMany(features, "default"));
};

export const getFeatureById = async (req: Request, res: Response) => {
  const { params } = featureParamsSchema.parse({ params: req.params });

  const feature = await featureService.getFeatureById(params.id);

  res.status(200).json(featurePresenter.present(feature, "default"));
};
