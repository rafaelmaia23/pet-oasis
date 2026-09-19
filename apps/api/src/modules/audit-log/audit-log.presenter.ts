import { auditLogViews } from "@pet-oasis/api-contracts/audit-log";
import { createPresenter } from "@/utils/presenter";

/**
 * Mascara o último segmento do IP (`192.168.1.42` → `192.168.1.***`) para quem
 * não tem `read:audit-log:full`. O dado permanece íntegro no banco; isto é só
 * serialização (docs/reference/logging-policy.md §5.3). `null` continua `null`; formato
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

export const auditLogPresenter = createPresenter(auditLogViews);
