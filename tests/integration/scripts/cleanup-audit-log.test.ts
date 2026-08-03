import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupAuditLog } from "@/scripts/cleanup-audit-log";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 365;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

async function createAuditLogRow(createdAt: Date) {
  return prisma.auditLog.create({
    data: {
      action: "AUTH_LOGIN_FAILED",
      targetType: "User",
      createdAt,
    },
  });
}

afterEach(async () => {
  await clearDatabase();
});

describe("cleanupAuditLog", () => {
  it("deletes an audit log row older than the retention window", async () => {
    const row = await createAuditLogRow(daysAgo(RETENTION_DAYS + 10));

    const result = await cleanupAuditLog({
      dryRun: false,
      retentionDays: RETENTION_DAYS,
    });

    const deleted = await prisma.auditLog.findUnique({ where: { id: row.id } });
    expect(deleted).toBeNull();
    expect(result.auditLogsDeleted).toBe(1);
  });

  it("keeps an audit log row within the retention window", async () => {
    const row = await createAuditLogRow(daysAgo(RETENTION_DAYS - 10));

    await cleanupAuditLog({ dryRun: false, retentionDays: RETENTION_DAYS });

    const survivor = await prisma.auditLog.findUnique({
      where: { id: row.id },
    });
    expect(survivor).not.toBeNull();
  });

  it("does not delete anything in dry-run mode, but reports the count", async () => {
    const row = await createAuditLogRow(daysAgo(RETENTION_DAYS + 10));

    const result = await cleanupAuditLog({
      dryRun: true,
      retentionDays: RETENTION_DAYS,
    });

    expect(result.auditLogsDeleted).toBe(1);
    await expect(
      prisma.auditLog.findUnique({ where: { id: row.id } }),
    ).resolves.not.toBeNull();
  });
});
