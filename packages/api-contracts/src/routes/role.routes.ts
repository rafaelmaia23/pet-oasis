import { staticList } from "../pagination/list-envelope";
import { roleParamsSchema } from "../role/role.schema";
import { roleViews } from "../role/role.views";
import { errorResponses } from "./responses";
import type { RouteGroup } from "./route.types";

export const roleRoutes = {
  list: {
    method: "GET",
    path: "/roles",
    tag: "Roles",
    auth: "bearer",
    summary: "Lista os papéis do sistema — exige read:role",
    responses: {
      200: {
        description: "Catálogo de papéis",
        view: staticList(roleViews.default),
      },
    },
    errors: { 401: errorResponses[401], 403: errorResponses[403] },
  },
  get: {
    method: "GET",
    path: "/roles/:id",
    tag: "Roles",
    auth: "bearer",
    summary: "Busca um papel por id — exige read:role",
    request: roleParamsSchema,
    responses: {
      200: { description: "Papel encontrado", view: roleViews.default },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  },
} as const satisfies RouteGroup;
