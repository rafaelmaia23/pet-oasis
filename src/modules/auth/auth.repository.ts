import type { VerificationPurpose } from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";

type CreateSessionData = {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
};

/**
 * Creates a session, evicting the oldest live ones first if the user is at
 * or above the live session cap (7.13). Login is never refused because of
 * the cap — the oldest sessions are just invalidated to make room.
 */
export async function createSessionAndEvictOldest(
  data: CreateSessionData,
  maxLiveSessions: number,
) {
  return prisma.$transaction(async (tx) => {
    const liveSessions = await tx.session.findMany({
      where: {
        userId: data.userId,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    const overflow = liveSessions.length - (maxLiveSessions - 1);
    if (overflow > 0) {
      await tx.session.updateMany({
        where: { id: { in: liveSessions.slice(0, overflow).map((s) => s.id) } },
        data: { invalidatedAt: new Date() },
      });
    }

    const session = await tx.session.create({
      data: {
        ...data,
        userAgent: data.userAgent ?? null,
        ipAddress: data.ipAddress ?? null,
      },
    });

    return { session, evictedCount: Math.max(overflow, 0) };
  });
}

export async function findSessionByHash(refreshTokenHash: string) {
  return prisma.session.findUnique({ where: { refreshTokenHash } });
}

export async function rotateSession(
  oldSessionId: string,
  newSession: CreateSessionData,
) {
  return prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: oldSessionId },
      data: { usedAt: new Date() },
    });

    return tx.session.create({
      data: {
        ...newSession,
        userAgent: newSession.userAgent ?? null,
        ipAddress: newSession.ipAddress ?? null,
      },
    });
  });
}

export async function invalidateSession(sessionId: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { invalidatedAt: new Date() },
  });
}

export async function invalidateAllUserSessions(userId: string) {
  return prisma.session.updateMany({
    where: { userId, invalidatedAt: null, expiresAt: { gt: new Date() } },
    data: { invalidatedAt: new Date() },
  });
}

export async function findSessionByIdForUser(id: string, userId: string) {
  return prisma.session.findFirst({ where: { id, userId } });
}

type CreateVerificationTokenData = {
  userId: string;
  tokenHash: string;
  purpose: VerificationPurpose;
  expiresAt: Date;
};

export async function createVerificationToken(
  data: CreateVerificationTokenData,
  audit?: AuditDescriptor,
) {
  if (!audit) return prisma.verificationToken.create({ data });

  return prisma.$transaction(async (tx) => {
    const token = await tx.verificationToken.create({ data });
    await record(audit, tx);
    return token;
  });
}

export async function findVerificationTokenByHash(tokenHash: string) {
  return prisma.verificationToken.findUnique({ where: { tokenHash } });
}

export async function consumeEmailVerification(
  tokenId: string,
  userId: string,
) {
  return prisma.$transaction([
    prisma.verificationToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    }),
  ]);
}

export async function consumePasswordReset(
  tokenId: string,
  userId: string,
  passwordHash: string,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.verificationToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    });
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await tx.session.updateMany({
      where: { userId, invalidatedAt: null, expiresAt: { gt: new Date() } },
      data: { invalidatedAt: new Date() },
    });
    if (audit) await record(audit, tx);
  });
}

export async function updatePasswordAndInvalidateSessions(
  userId: string,
  passwordHash: string,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await tx.session.updateMany({
      where: { userId, invalidatedAt: null, expiresAt: { gt: new Date() } },
      data: { invalidatedAt: new Date() },
    });
    if (audit) await record(audit, tx);
  });
}

export async function findLiveSessionsByUserId(userId: string) {
  return prisma.session.findMany({
    where: {
      userId,
      usedAt: null,
      invalidatedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}
