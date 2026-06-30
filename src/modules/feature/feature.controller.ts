import type { Request, Response } from "express";
import { asyncHandler } from "@/utils/asyncHandler";
import { featurePresenter } from "./feature.presenter";
import { featureParamsSchema } from "./feature.schema";
import * as featureService from "./feature.service";

export const getAllFeatures = asyncHandler(
  async (_req: Request, res: Response) => {
    const features = await featureService.getAllFeatures();

    res.status(200).json(featurePresenter.presentMany(features, "default"));
  },
);

export const getFeatureById = asyncHandler(
  async (req: Request, res: Response) => {
    const { params } = featureParamsSchema.parse({ params: req.params });

    const feature = await featureService.getFeatureById(params.id);

    res.status(200).json(featurePresenter.present(feature, "default"));
  },
);
