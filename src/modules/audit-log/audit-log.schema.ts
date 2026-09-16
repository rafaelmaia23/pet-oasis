import { z } from "zod";
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from "@/lib/auditLog.constants";
import { cursorQuerySchema } from "@/lib/pagination";

/**
 * Todo `targetId` gravado é o uuid do recurso, então o filtro compara igualdade
 * contra 36 caracteres — mais que isso nunca casa (10.13). Se um dia o alvo
 * ganhar outra chave, o teto sobe junto com quem a grava.
 */
const TARGET_ID_MAX_LENGTH = 36;

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
      .enum(AUDIT_TARGET_TYPES)
      .optional()
      .meta({ description: "Filtra pelo tipo de alvo", example: "User" }),
    targetId: z
      .string()
      .min(1)
      .max(
        TARGET_ID_MAX_LENGTH,
        `targetId deve ter no máximo ${TARGET_ID_MAX_LENGTH} caracteres`,
      )
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
