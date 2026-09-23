import { z } from "zod";

// O `ip` sai mascarado (`192.168.1.***`) para quem não tem
// `read:audit-log:full`; quem mascara é o presenter da API — a view só diz que
// o campo é string ou null.
const defaultView = z
  .object({
    id: z.uuid(),
    action: z.string().meta({ example: "USER_BANNED" }),
    targetType: z.string().meta({ example: "User" }),
    targetId: z.string().nullable(),
    actorId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    ip: z.string().nullable().meta({ example: "192.168.1.***" }),
    userAgent: z.string().nullable(),
    createdAt: z.coerce.date(),
  })
  .meta({
    id: "AuditLog",
    description:
      "Linha da trilha de auditoria (ip mascarado sem read:audit-log:full)",
  });

export const auditLogViews = {
  default: defaultView,
} as const;

export type AuditLogView = keyof typeof auditLogViews;
