import { z } from "zod";
import { AUDIT_ACTIONS } from "@/lib/auditLog.constants";
import { cursorQuerySchema } from "@/lib/pagination";

export const listAuditLogsSchema = z.object({
  query: cursorQuerySchema.extend({
    action: z
      .enum(AUDIT_ACTIONS)
      .optional()
      .meta({ description: "Filtra por ação", example: "USER_BANNED" }),
    actorId: z
      .uuid()
      .optional()
      .meta({ description: "Filtra pelo ator (uuid)" }),
    targetType: z
      .enum(["User", "Route", "System"])
      .optional()
      .meta({ description: "Filtra pelo tipo de alvo", example: "User" }),
    targetId: z
      .string()
      .min(1)
      .optional()
      .meta({ description: "Filtra pelo id do alvo" }),
    from: z.coerce
      .date()
      .optional()
      .meta({ description: "Início do intervalo (createdAt >= from)" }),
    to: z.coerce
      .date()
      .optional()
      .meta({ description: "Fim do intervalo (createdAt <= to)" }),
  }),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsSchema>["query"];
