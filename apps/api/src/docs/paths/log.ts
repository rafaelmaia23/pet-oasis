import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { listRecentLogsSchema } from "@/modules/log/log.schema";
import { errorResponses, jsonResponse } from "../components";
import { fromEnvelope } from "../helpers";

// As linhas do buffer são objetos heterogêneos (já redigidos pelo pino), então
// a view é genérica; o `meta` declara as limitações do ring buffer (§9).
const recentLogsResponse = z
  .object({
    data: z.array(z.record(z.string(), z.unknown())),
    meta: z.object({
      count: z.number().int(),
      capacity: z.number().int(),
      perProcess: z.literal(true),
      volatile: z.literal(true),
    }),
  })
  .meta({ id: "RecentLogs", description: "Fatia recente do ring buffer" });

export const logPaths: ZodOpenApiPathsObject = {
  "/logs/recent": {
    get: {
      tags: ["Logs"],
      summary:
        "Linhas recentes do buffer de logs em memória — exige read:log " +
        "(por processo, volátil)",
      ...fromEnvelope(listRecentLogsSchema),
      responses: {
        200: jsonResponse(
          "Linhas recentes (mais novas primeiro)",
          recentLogsResponse,
        ),
        401: errorResponses[401],
        403: errorResponses[403],
        422: errorResponses[422],
      },
    },
  },
};
