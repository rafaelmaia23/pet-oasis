import { buildCustomer } from "@tests/factories/user.factory";
import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import { cleanupSessions } from "@/scripts/cleanup-sessions";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

async function createSessionRow(
  userId: string,
  overrides: {
    expiresAt?: Date;
    usedAt?: Date | null;
    invalidatedAt?: Date | null;
  } = {},
) {
  return prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(generateOpaqueToken()),
      expiresAt: overrides.expiresAt ?? daysFromNow(7),
      usedAt: overrides.usedAt ?? null,
      invalidatedAt: overrides.invalidatedAt ?? null,
    },
  });
}

async function createVerificationTokenRow(
  userId: string,
  overrides: { expiresAt?: Date; usedAt?: Date | null } = {},
) {
  return prisma.verificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(generateOpaqueToken()),
      purpose: "EMAIL_VERIFICATION",
      expiresAt: overrides.expiresAt ?? daysFromNow(1),
      usedAt: overrides.usedAt ?? null,
    },
  });
}

afterEach(async () => {
  await clearDatabase();
});

describe("cleanupSessions", () => {
  it("keeps a live session regardless of age", async () => {
    const user = await buildCustomer();
    const session = await createSessionRow(user.id, {
      expiresAt: daysFromNow(7),
    });

    await cleanupSessions({ dryRun: false, retentionDays: RETENTION_DAYS });

    const survivor = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(survivor).not.toBeNull();
  });

  it("deletes a session expired for longer than the retention window", async () => {
    const user = await buildCustomer();
    const session = await createSessionRow(user.id, {
      expiresAt: daysAgo(RETENTION_DAYS + 10),
    });

    const result = await cleanupSessions({
      dryRun: false,
      retentionDays: RETENTION_DAYS,
    });

    const deleted = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(deleted).toBeNull();
    expect(result.sessionsDeleted).toBe(1);
  });

  it("keeps a session that expired more recently than the retention window", async () => {
    const user = await buildCustomer();
    const session = await createSessionRow(user.id, {
      expiresAt: daysAgo(RETENTION_DAYS - 10),
    });

    await cleanupSessions({ dryRun: false, retentionDays: RETENTION_DAYS });

    const survivor = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(survivor).not.toBeNull();
  });

  it("deletes a session invalidated long ago even if it hasn't naturally expired yet", async () => {
    const user = await buildCustomer();
    const session = await createSessionRow(user.id, {
      expiresAt: daysFromNow(2),
      invalidatedAt: daysAgo(RETENTION_DAYS + 10),
    });

    await cleanupSessions({ dryRun: false, retentionDays: RETENTION_DAYS });

    const deleted = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(deleted).toBeNull();
  });

  it("deletes a session used (rotated) long ago even if it hasn't naturally expired yet", async () => {
    const user = await buildCustomer();
    const session = await createSessionRow(user.id, {
      expiresAt: daysFromNow(2),
      usedAt: daysAgo(RETENTION_DAYS + 10),
    });

    await cleanupSessions({ dryRun: false, retentionDays: RETENTION_DAYS });

    const deleted = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(deleted).toBeNull();
  });

  it("deletes a verification token used long ago", async () => {
    const user = await buildCustomer();
    const token = await createVerificationTokenRow(user.id, {
      expiresAt: daysFromNow(1),
      usedAt: daysAgo(RETENTION_DAYS + 10),
    });

    const result = await cleanupSessions({
      dryRun: false,
      retentionDays: RETENTION_DAYS,
    });

    const deleted = await prisma.verificationToken.findUnique({
      where: { id: token.id },
    });
    expect(deleted).toBeNull();
    expect(result.verificationTokensDeleted).toBe(1);
  });

  it("keeps a verification token that is unused and unexpired", async () => {
    const user = await buildCustomer();
    const token = await createVerificationTokenRow(user.id, {
      expiresAt: daysFromNow(1),
    });

    await cleanupSessions({ dryRun: false, retentionDays: RETENTION_DAYS });

    const survivor = await prisma.verificationToken.findUnique({
      where: { id: token.id },
    });
    expect(survivor).not.toBeNull();
  });

  it("deletes a verification token expired for longer than the retention window", async () => {
    const user = await buildCustomer();
    const token = await createVerificationTokenRow(user.id, {
      expiresAt: daysAgo(RETENTION_DAYS + 10),
    });

    await cleanupSessions({ dryRun: false, retentionDays: RETENTION_DAYS });

    const deleted = await prisma.verificationToken.findUnique({
      where: { id: token.id },
    });
    expect(deleted).toBeNull();
  });

  it("does not delete anything in dry-run mode, but reports the counts", async () => {
    const user = await buildCustomer();
    const session = await createSessionRow(user.id, {
      expiresAt: daysAgo(RETENTION_DAYS + 10),
    });
    const token = await createVerificationTokenRow(user.id, {
      expiresAt: daysAgo(RETENTION_DAYS + 10),
    });

    const result = await cleanupSessions({
      dryRun: true,
      retentionDays: RETENTION_DAYS,
    });

    expect(result.sessionsDeleted).toBe(1);
    expect(result.verificationTokensDeleted).toBe(1);
    await expect(
      prisma.session.findUnique({ where: { id: session.id } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.verificationToken.findUnique({ where: { id: token.id } }),
    ).resolves.not.toBeNull();
  });
});
