import type { VerificationPurpose } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

type CreateSessionData = {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
};

export async function createSession(data: CreateSessionData) {
  return prisma.session.create({
    data: {
      ...data,
      userAgent: data.userAgent ?? null,
      ipAddress: data.ipAddress ?? null,
    },
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
) {
  return prisma.verificationToken.create({ data });
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
