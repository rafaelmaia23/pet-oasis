import { pathToFileURL } from "node:url";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * Hard delete de AuditLog acima de AUDIT_LOG_RETENTION_DAYS (7.13) — único
 * ponto do código autorizado a apagar audit log (docs/logging-policy.md §7).
 * Nunca roda no ciclo request/response.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const log = logger.child({ module: "cleanup-audit-log" });

export async function cleanupAuditLog(options: {
  dryRun: boolean;
  retentionDays?: number;
}): Promise<{ auditLogsDeleted: number; durationMs: number }> {
  const start = Date.now();
  const retentionDays = options.retentionDays ?? env.AUDIT_LOG_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
  const where = { createdAt: { lt: cutoff } };

  const auditLogsDeleted = options.dryRun
    ? await prisma.auditLog.count({ where })
    : (await prisma.auditLog.deleteMany({ where })).count;

  return { auditLogsDeleted, durationMs: Date.now() - start };
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const dryRun = process.argv.includes("--dry-run");

  cleanupAuditLog({ dryRun })
    .then((result) => {
      log.info(
        result,
        dryRun ? "cleanup-audit-log dry-run" : "cleanup-audit-log completed",
      );
      process.exit(0);
    })
    .catch((error: unknown) => {
      log.error({ err: error }, "cleanup-audit-log failed");
      process.exit(1);
    });
}
