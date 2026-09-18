import { z } from "zod";
import type { ZodOpenApiPathsObject } from "zod-openapi";
import { jsonResponse } from "../components";

const statusResponseSchema = z
  .object({
    updated_at: z.string().meta({ example: "2026-01-15T12:00:00.000Z" }),
    dependencies: z.object({
      database: z.object({
        version: z.string().meta({ example: "16.14" }),
        max_connections: z.number().meta({ example: 100 }),
        opened_connections: z.number().meta({ example: 1 }),
      }),
    }),
  })
  .meta({ id: "Status" });

export const statusPaths: ZodOpenApiPathsObject = {
  "/status": {
    get: {
      tags: ["Status"],
      summary: "Saúde da aplicação e do banco de dados",
      security: [],
      responses: {
        200: jsonResponse("Aplicação no ar", statusResponseSchema),
      },
    },
  },
};
