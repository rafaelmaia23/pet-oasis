import { statusViews } from "../status/status.views";
import type { RouteGroup } from "./route.types";

export const statusRoutes = {
  get: {
    method: "GET",
    path: "/status",
    tag: "Status",
    auth: "public",
    summary: "Saúde da aplicação e do banco de dados",
    responses: {
      200: { description: "Aplicação no ar", view: statusViews.default },
    },
    errors: {},
  },
} as const satisfies RouteGroup;
