import { z } from "zod";

export const listRecentLogsSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).optional().meta({
      description: "Limita às N linhas mais recentes (default: tudo no buffer)",
      example: 50,
    }),
  }),
});

export type ListRecentLogsQuery = z.infer<typeof listRecentLogsSchema>["query"];
