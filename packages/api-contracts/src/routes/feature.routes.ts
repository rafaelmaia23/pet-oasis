import { featureParamsSchema } from "../feature/feature.schema";
import { featureViews } from "../feature/feature.views";
import { staticList } from "../pagination/list-envelope";
import { errorResponses } from "./responses";
import type { RouteGroup } from "./route.types";

export const featureRoutes = {
  list: {
    method: "GET",
    path: "/features",
    tag: "Features",
    auth: "bearer",
    summary: "Lista as features do sistema — exige read:feature",
    responses: {
      200: {
        description: "Catálogo de features",
        view: staticList(featureViews.default),
      },
    },
    errors: { 401: errorResponses[401], 403: errorResponses[403] },
  },
  get: {
    method: "GET",
    path: "/features/:id",
    tag: "Features",
    auth: "bearer",
    summary: "Busca uma feature por id — exige read:feature",
    request: featureParamsSchema,
    responses: {
      200: { description: "Feature encontrada", view: featureViews.default },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  },
} as const satisfies RouteGroup;
