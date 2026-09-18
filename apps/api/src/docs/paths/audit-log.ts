import type { ZodOpenApiPathsObject } from "zod-openapi";
import { auditLogViews } from "@/modules/audit-log/audit-log.presenter";
import { listAuditLogsSchema } from "@/modules/audit-log/audit-log.schema";
import { cursorList, errorResponses, jsonResponse } from "../components";
import { fromEnvelope } from "../helpers";

export const auditLogPaths: ZodOpenApiPathsObject = {
  "/audit-logs": {
    get: {
      tags: ["Audit"],
      summary:
        "Lista a trilha de auditoria (cursor) — exige read:audit-log; " +
        "read:audit-log:full destrava o IP inteiro",
      ...fromEnvelope(listAuditLogsSchema),
      responses: {
        200: jsonResponse(
          "Página da trilha (ip mascarado sem read:audit-log:full)",
          cursorList(auditLogViews.default),
        ),
        401: errorResponses[401],
        403: errorResponses[403],
        422: errorResponses[422],
      },
    },
  },
};
