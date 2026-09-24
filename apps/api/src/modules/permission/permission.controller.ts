import type { routes } from "@pet-oasis/api-contracts/routes";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as permissionService from "@/modules/permission/permission.service";

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

export const upsertUserFeature: RouteHandler<
  typeof routes.permission.upsertOverride
> = async ({ params, body, actor }) =>
  permissionService.upsertUserFeature(
    actor.id,
    params.userId,
    params.roleId,
    params.featureId,
    body.granted,
  );

export const removeUserFeature: RouteHandler<
  typeof routes.permission.removeOverride
> = async ({ params, actor }) => {
  await permissionService.removeUserFeature(
    actor.id,
    params.userId,
    params.roleId,
    params.featureId,
  );
};
