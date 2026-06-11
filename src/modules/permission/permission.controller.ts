import type { Request, Response } from "express";
import {
  permissionParamsSchema,
  userIdParamsSchema,
} from "@/modules/permission/permission.schema";
import * as permissionService from "@/modules/permission/permission.service";
import { asyncHandler } from "@/utils/asyncHandler";
import { getAuthUser } from "@/utils/getAuthUser";

export const getUserFeatures = asyncHandler(
  async (req: Request, res: Response) => {
    const { params } = userIdParamsSchema.parse({ params: req.params });

    const features = await permissionService.getUserFeatures(params.userId);

    res.status(200).json(features);
  },
);

export const assignFeatureToUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { params } = permissionParamsSchema.parse({ params: req.params });

    const userFeature = await permissionService.assignFeatureToUser(
      params.userId,
      params.featureId,
    );

    res.status(201).json(userFeature);
  },
);

export const removeFeatureFromUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { params } = permissionParamsSchema.parse({ params: req.params });
    const requesterId = getAuthUser(req).id;

    await permissionService.removeFeatureFromUser(
      requesterId,
      params.userId,
      params.featureId,
    );

    res.status(204).send();
  },
);
