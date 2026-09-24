import {
  removePermissionParamsSchema,
  upsertPermissionParamsSchema,
} from "@pet-oasis/api-contracts/permission";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as permissionService from "@/modules/permission/permission.service";
import { getAuthUser } from "@/utils/getAuthUser";
import { userFeaturePresenter } from "./permission.presenter";

export const getUserFeatures: RouteHandler<
  typeof routes.permission.listFeatures
> = async ({ params }) => {
  // Sem paginação: são os overrides de um usuário, coleção pequena por
  // construção (docs/adr/0004-pagination.md).
  const features = await permissionService.getUserFeatures(params.userId);

  return listEnvelope(features);
};

export const getUserRoles: RouteHandler<
  typeof routes.permission.listRoles
> = async ({ params }) => {
  const roles = await permissionService.getUserRoles(params.userId);

  return listEnvelope(roles);
};

export const getUserPermissions: RouteHandler<
  typeof routes.permission.listEffectiveFeatures
> = async ({ params }) => permissionService.getUserPermissions(params.userId);

export const addUserRole: RouteHandler<
  typeof routes.permission.assignRole
> = async ({ params, actor }) =>
  permissionService.addUserRole(actor.id, params.userId, params.roleId);

export const removeUserRole: RouteHandler<
  typeof routes.permission.revokeRole
> = async ({ params, actor }) => {
  await permissionService.removeUserRole(
    actor.id,
    params.userId,
    params.roleId,
  );
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
    params.roleId,
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
    params.roleId,
    params.featureId,
  );

  res.status(204).send();
};
