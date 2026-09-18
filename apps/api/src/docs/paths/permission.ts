import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  effectiveFeaturesViews,
  userFeatureViews,
} from "@/modules/permission/permission.presenter";
import {
  deleteUserRoleParamsSchema,
  getPermissionParamsSchema,
  getUserPermissionsParamsSchema,
  getUserRolesParamsSchema,
  postUserRoleParamsSchema,
  removePermissionParamsSchema,
  upsertPermissionParamsSchema,
} from "@/modules/permission/permission.schema";
import { roleViews } from "@/modules/role/role.presenter";
import {
  errorResponses,
  jsonResponse,
  noContentResponse,
  staticList,
} from "../components";
import { fromEnvelope } from "../helpers";

const readErrors = {
  401: errorResponses[401],
  403: errorResponses[403],
  404: errorResponses[404],
};

const manageErrors = {
  401: errorResponses[401],
  403: errorResponses[403],
  404: errorResponses[404],
  409: errorResponses[409],
};

export const permissionPaths: ZodOpenApiPathsObject = {
  "/users/{userId}/features": {
    get: {
      tags: ["Permissions"],
      summary: "Overrides de feature de um usuário — exige read:permission",
      ...fromEnvelope(getPermissionParamsSchema),
      responses: {
        200: jsonResponse("Overrides", staticList(userFeatureViews.default)),
        ...readErrors,
      },
    },
  },
  "/users/{userId}/roles": {
    get: {
      tags: ["Permissions"],
      summary: "Roles ativas de um usuário — exige read:permission",
      ...fromEnvelope(getUserRolesParamsSchema),
      responses: {
        200: jsonResponse("Roles do usuário", staticList(roleViews.default)),
        ...readErrors,
      },
    },
  },
  "/users/{userId}/permissions": {
    get: {
      tags: ["Permissions"],
      summary: "Features efetivas de um usuário — exige read:permission",
      ...fromEnvelope(getUserPermissionsParamsSchema),
      responses: {
        200: jsonResponse("Features efetivas", effectiveFeaturesViews.default),
        ...readErrors,
      },
    },
  },
  "/users/{userId}/roles/{roleId}": {
    post: {
      tags: ["Permissions"],
      summary: "Atribui uma role a um usuário — exige manage:permission",
      ...fromEnvelope(postUserRoleParamsSchema),
      responses: {
        201: jsonResponse("Role atribuída", roleViews.default),
        ...manageErrors,
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Permissions"],
      summary: "Revoga uma role de um usuário — exige manage:permission",
      ...fromEnvelope(deleteUserRoleParamsSchema),
      responses: { 204: noContentResponse, ...manageErrors },
    },
  },
  // A role vai no path: a identidade do override é a tripla (user, role,
  // feature) — ver D9 em docs/todo.md.
  "/users/{userId}/roles/{roleId}/features/{featureId}": {
    put: {
      tags: ["Permissions"],
      summary:
        "Cria/atualiza um override de feature numa role do usuário — exige manage:permission",
      ...fromEnvelope(upsertPermissionParamsSchema),
      responses: {
        200: jsonResponse("Override aplicado", userFeatureViews.default),
        ...manageErrors,
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Permissions"],
      summary: "Remove um override de feature — exige manage:permission",
      ...fromEnvelope(removePermissionParamsSchema),
      responses: { 204: noContentResponse, ...readErrors },
    },
  },
};
