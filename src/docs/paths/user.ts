import type { ZodOpenApiPathsObject } from "zod-openapi";
import { userViews } from "@/modules/user/user.presenter";
import {
  banUserSchema,
  createEmployeeSchema,
  listUsersSchema,
  updateUserSchema,
  userParamsSchema,
} from "@/modules/user/user.schema";
import {
  errorResponses,
  jsonResponse,
  noContentResponse,
  offsetList,
} from "../components";
import { fromEnvelope } from "../helpers";

export const userPaths: ZodOpenApiPathsObject = {
  "/users": {
    post: {
      tags: ["Users"],
      summary: "Cria um usuário (employee) — exige create:user",
      ...fromEnvelope(createEmployeeSchema),
      responses: {
        201: jsonResponse("Usuário criado", userViews.owner),
        401: errorResponses[401],
        403: errorResponses[403],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    get: {
      tags: ["Users"],
      summary:
        "Lista usuários (paginação offset + filtros) — exige read:user:others",
      ...fromEnvelope(listUsersSchema),
      responses: {
        200: jsonResponse("Lista de usuários", offsetList(userViews.admin)),
        401: errorResponses[401],
        403: errorResponses[403],
        422: errorResponses[422],
      },
    },
  },
  "/users/{id}": {
    get: {
      tags: ["Users"],
      summary: "Busca um usuário por id (view resolvida pela capability)",
      ...fromEnvelope(userParamsSchema),
      responses: {
        200: jsonResponse("Usuário encontrado", userViews.admin),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    },
    patch: {
      tags: ["Users"],
      summary: "Atualiza campos do usuário (apenas name)",
      ...fromEnvelope(updateUserSchema),
      responses: {
        200: jsonResponse("Usuário atualizado", userViews.owner),
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Users"],
      summary: "Soft delete de um usuário",
      ...fromEnvelope(userParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    },
  },
  "/users/{id}/ban": {
    post: {
      tags: ["Users"],
      summary: "Bane um usuário — exige manage:user:status",
      ...fromEnvelope(banUserSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Users"],
      summary: "Desbane um usuário — exige manage:user:status",
      ...fromEnvelope(userParamsSchema),
      responses: {
        204: noContentResponse,
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
      },
    },
  },
};
