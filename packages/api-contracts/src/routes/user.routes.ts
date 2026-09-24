import { offsetList } from "../pagination/list-envelope";
import {
  banUserSchema,
  createEmployeeSchema,
  forcePasswordResetSchema,
  listUsersSchema,
  reactivateAccountSchema,
  updateUserSchema,
  userParamsSchema,
} from "../user/user.schema";
import { userViewSchemas, userViews } from "../user/user.views";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

export const userRoutes = {
  create: {
    method: "POST",
    path: "/users",
    tag: "Users",
    auth: "bearer",
    summary: "Cria um usuário (employee) — exige create:user",
    request: createEmployeeSchema,
    responses: {
      201: { description: "Usuário criado", view: userViewSchemas },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  list: {
    method: "GET",
    path: "/users",
    tag: "Users",
    auth: "bearer",
    summary:
      "Lista usuários (paginação offset + filtros) — exige read:user:others",
    request: listUsersSchema,
    responses: {
      200: {
        description: "Lista de usuários",
        // A listagem não tem escada: só quem tem `read:user:others` chega
        // aqui, e a view é fixa em `admin` para a página inteira.
        view: offsetList(userViews.admin),
      },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      422: errorResponses[422],
    },
  },
  get: {
    method: "GET",
    path: "/users/:id",
    tag: "Users",
    auth: "bearer",
    summary: "Busca um usuário por id (view resolvida pela feature efetiva)",
    request: userParamsSchema,
    responses: {
      200: { description: "Usuário encontrado", view: userViewSchemas },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  },
  update: {
    method: "PATCH",
    path: "/users/:id",
    tag: "Users",
    auth: "bearer",
    summary: "Atualiza campos do usuário (apenas name)",
    request: updateUserSchema,
    responses: {
      200: { description: "Usuário atualizado", view: userViewSchemas },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      422: errorResponses[422],
    },
  },
  delete: {
    method: "DELETE",
    path: "/users/:id",
    tag: "Users",
    auth: "bearer",
    summary: "Soft delete de um usuário",
    request: userParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  },
  ban: {
    method: "POST",
    path: "/users/:id/ban",
    tag: "Users",
    auth: "bearer",
    summary: "Bane um usuário — exige manage:user:status",
    request: banUserSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
  unban: {
    method: "DELETE",
    path: "/users/:id/ban",
    tag: "Users",
    auth: "bearer",
    summary: "Desbane um usuário — exige manage:user:status",
    request: userParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  },
  unlock: {
    method: "DELETE",
    path: "/users/:id/lock",
    tag: "Users",
    auth: "bearer",
    summary:
      "Desbloqueia uma conta travada por lockout — exige manage:user:status",
    request: userParamsSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  },
  reactivate: {
    method: "POST",
    path: "/users/:id/reactivate",
    tag: "Users",
    auth: "bearer",
    summary:
      "Dispara a reativação de uma conta excluída, escolhendo perfis e roles — exige reactivate:user; a conta só volta quando o dono confirma via /auth/confirm-account-reactivation",
    request: reactivateAccountSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
      429: errorResponses[429],
    },
  },
  forcePasswordReset: {
    method: "POST",
    path: "/users/:id/force-password-reset",
    tag: "Users",
    auth: "bearer",
    summary:
      "Força a troca de senha de um usuário (login bloqueado até o reset via email) — exige manage:user:status",
    request: forcePasswordResetSchema,
    responses: { 204: noContent },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
      422: errorResponses[422],
    },
  },
} as const satisfies RouteGroup;
