import { listAuditLogsSchema } from "../audit-log/audit-log.schema";
import { auditLogViews } from "../audit-log/audit-log.views";
import { cursorList } from "../pagination/list-envelope";
import { errorResponses } from "./responses";
import type { RouteGroup } from "./route.types";

export const auditLogRoutes = {
  list: {
    method: "GET",
    path: "/audit-logs",
    tag: "Audit",
    auth: "bearer",
    summary:
      "Lista a trilha de auditoria (cursor) — exige read:audit-log; " +
      "read:audit-log:full destrava o IP inteiro",
    request: listAuditLogsSchema,
    responses: {
      200: {
        description: "Página da trilha (ip mascarado sem read:audit-log:full)",
        view: cursorList(auditLogViews.default),
      },
    },
    errors: {
      401: errorResponses[401],
      403: errorResponses[403],
      422: errorResponses[422],
    },
  },
} satisfies RouteGroup;
