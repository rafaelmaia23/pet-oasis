import { listRecentLogsSchema } from "../log/log.schema";
import { recentLogsViews } from "../log/log.views";
import { errorResponses } from "./responses";
import type { RouteGroup } from "./route.types";

export const logRoutes = {
  listRecent: {
    method: "GET",
    path: "/logs/recent",
    tag: "Logs",
    auth: "bearer",
    summary:
      "Linhas recentes do buffer de logs em memória — exige read:log " +
      "(por processo, volátil)",
    request: listRecentLogsSchema,
    responses: {
      200: {
        description: "Linhas recentes (mais novas primeiro)",
        view: recentLogsViews.default,
      },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      422: errorResponses[422],
    },
  },
} as const satisfies RouteGroup;
