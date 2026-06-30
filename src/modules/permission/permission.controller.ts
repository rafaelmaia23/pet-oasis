import type { Request, Response } from "express";
import {
  getPermissionParamsSchema,
  removePermissionParamsSchema,
  upsertPermissionParamsSchema,
} from "@/modules/permission/permission.schema";
import * as permissionService from "@/modules/permission/permission.service";
import { asyncHandler } from "@/utils/asyncHandler";
import { getAuthUser } from "@/utils/getAuthUser";
import { userFeaturePresenter } from "./permission.presenter";

export const getUserFeatures = asyncHandler(
  async (req: Request, res: Response) => {
    const { params } = getPermissionParamsSchema.parse({ params: req.params });

    const features = await permissionService.getUserFeatures(params.userId);

    res.status(200).json(userFeaturePresenter.presentMany(features, "default"));
  },
);

export const upsertUserFeature = asyncHandler(
  async (req: Request, res: Response) => {
    const { params, body } = upsertPermissionParamsSchema.parse({
      params: req.params,
      body: req.body,
    });

    const requestingUser = getAuthUser(req);

    const userFeature = await permissionService.upsertUserFeature(
      requestingUser.id,
      params.userId,
      params.featureId,
      body.granted,
    );

    res.status(200).json(userFeaturePresenter.present(userFeature, "default"));
  },
);

export const removeUserFeature = asyncHandler(
  async (req: Request, res: Response) => {
    const { params } = removePermissionParamsSchema.parse({
      params: req.params,
    });

    const requesterId = getAuthUser(req).id;

    await permissionService.removeUserFeature(
      requesterId,
      params.userId,
      params.featureId,
    );

    res.status(204).send();
  },
);
