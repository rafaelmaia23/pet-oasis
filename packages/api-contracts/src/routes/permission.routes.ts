import { staticList } from "../pagination/list-envelope";
import {
  deleteUserRoleParamsSchema,
  getPermissionParamsSchema,
  getUserPermissionsParamsSchema,
  getUserRolesParamsSchema,
  postUserRoleParamsSchema,
  removePermissionParamsSchema,
  upsertPermissionParamsSchema,
} from "../permission/permission.schema";
import {
  effectiveFeaturesViews,
  userFeatureViews,
} from "../permission/permission.views";
import { roleViews } from "../role/role.views";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

const readErrors = {
  401: errorResponses[401],
  403: errorResponses[403],
  404: errorResponses[404],
};

const manageErrors = { ...readErrors, 409: errorResponses[409] };

export const permissionRoutes = {
  listFeatures: {
    method: "GET",
    path: "/users/:userId/features",
    tag: "Permissions",
    auth: "bearer",
    summary: "Overrides de feature de um usuário — exige read:permission",
    request: getPermissionParamsSchema,
    responses: {
      200: {
        description: "Overrides",
        view: staticList(userFeatureViews.default),
      },
    },
    errors: readErrors,
  },
  listRoles: {
    method: "GET",
    path: "/users/:userId/roles",
    tag: "Permissions",
    auth: "bearer",
    summary: "Roles ativas de um usuário — exige read:permission",
    request: getUserRolesParamsSchema,
    responses: {
      200: {
        description: "Roles do usuário",
        view: staticList(roleViews.default),
      },
    },
    errors: readErrors,
  },
  listEffectiveFeatures: {
    method: "GET",
    path: "/users/:userId/permissions",
    tag: "Permissions",
    auth: "bearer",
    summary: "Features efetivas de um usuário — exige read:permission",
    request: getUserPermissionsParamsSchema,
    responses: {
      200: {
        description: "Features efetivas",
        view: effectiveFeaturesViews.default,
      },
    },
    errors: readErrors,
  },
  assignRole: {
    method: "POST",
    path: "/users/:userId/roles/:roleId",
    tag: "Permissions",
    auth: "bearer",
    summary: "Atribui uma role a um usuário — exige manage:permission",
    request: postUserRoleParamsSchema,
    responses: {
      201: { description: "Role atribuída", view: roleViews.default },
    },
    errors: { ...manageErrors, 422: errorResponses[422] },
  },
  revokeRole: {
    method: "DELETE",
    path: "/users/:userId/roles/:roleId",
    tag: "Permissions",
    auth: "bearer",
    summary: "Revoga uma role de um usuário — exige manage:permission",
    request: deleteUserRoleParamsSchema,
    responses: { 204: noContent },
    errors: manageErrors,
  },
  // A role vai no path: a identidade do override é a tripla (user, role,
  // feature) — ver D9 em docs/todo.md.
  upsertOverride: {
    method: "PUT",
    path: "/users/:userId/roles/:roleId/features/:featureId",
    tag: "Permissions",
    auth: "bearer",
    summary:
      "Cria/atualiza um override de feature numa role do usuário — exige manage:permission",
    request: upsertPermissionParamsSchema,
    responses: {
      200: { description: "Override aplicado", view: userFeatureViews.default },
    },
    errors: { ...manageErrors, 422: errorResponses[422] },
  },
  removeOverride: {
    method: "DELETE",
    path: "/users/:userId/roles/:roleId/features/:featureId",
    tag: "Permissions",
    auth: "bearer",
    summary: "Remove um override de feature — exige manage:permission",
    request: removePermissionParamsSchema,
    responses: { 204: noContent },
    errors: readErrors,
  },
} satisfies RouteGroup;
