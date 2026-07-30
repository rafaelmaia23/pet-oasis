import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import {
  deleteUserRoleParamsSchema,
  getPermissionParamsSchema,
  getUserPermissionsParamsSchema,
  getUserRolesParamsSchema,
  postUserRoleParamsSchema,
  removePermissionParamsSchema,
  upsertPermissionParamsSchema,
} from "@/modules/permission/permission.schema";
import * as permissionService from "@/modules/permission/permission.service";
import { rolePresenter } from "@/modules/role/role.presenter";
import { getAuthUser } from "@/utils/getAuthUser";
import {
  effectiveFeaturesPresenter,
  userFeaturePresenter,
} from "./permission.presenter";

export const getUserFeatures = async (req: Request, res: Response) => {
  const { params } = getPermissionParamsSchema.parse({ params: req.params });

  const features = await permissionService.getUserFeatures(params.userId);

  res
    .status(200)
    .json(listEnvelope(userFeaturePresenter.presentMany(features, "default")));
};

export const getUserRoles = async (req: Request, res: Response) => {
  const { params } = getUserRolesParamsSchema.parse({
    params: req.params,
  });

  const roles = await permissionService.getUserRoles(params.userId);

  res
    .status(200)
    .json(listEnvelope(rolePresenter.presentMany(roles, "default")));
};

export const getUserPermissions = async (req: Request, res: Response) => {
  const { params } = getUserPermissionsParamsSchema.parse({
    params: req.params,
  });

  const features = await permissionService.getUserPermissions(params.userId);

  res.status(200).json(effectiveFeaturesPresenter.present(features, "default"));
};

export const addUserRole = async (req: Request, res: Response) => {
  const { params } = postUserRoleParamsSchema.parse({
    params: req.params,
  });

  const requestingUser = getAuthUser(req);

  const role = await permissionService.addUserRole(
    requestingUser.id,
    params.userId,
    params.roleId,
  );

  res.status(201).json(rolePresenter.present(role, "default"));
};

export const removeUserRole = async (req: Request, res: Response) => {
  const { params } = deleteUserRoleParamsSchema.parse({
    params: req.params,
  });

  const requestingUser = getAuthUser(req);

  await permissionService.removeUserRole(
    requestingUser.id,
    params.userId,
    params.roleId,
  );

  res.status(204).send();
};

export const upsertUserFeature = async (req: Request, res: Response) => {
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
};

export const removeUserFeature = async (req: Request, res: Response) => {
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
};
