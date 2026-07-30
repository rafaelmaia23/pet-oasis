import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

/**
 * Mascara o último segmento do IP (`192.168.1.42` → `192.168.1.***`) para quem
 * não tem `read:audit-log:full`. O dado permanece íntegro no banco; isto é só
 * serialização (docs/logging-policy.md §5.3). `null` continua `null`; formato
 * não reconhecido vira `***`.
 */
export function maskIp(ip: string | null): string | null {
  if (!ip) return null;

  if (ip.includes(".")) {
    const parts = ip.split(".");
    parts[parts.length - 1] = "***";
    return parts.join(".");
  }

  if (ip.includes(":")) {
    const parts = ip.split(":");
    parts[parts.length - 1] = "***";
    return parts.join(":");
  }

  return "***";
}

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

export const auditLogPresenter = createPresenter(auditLogViews);
