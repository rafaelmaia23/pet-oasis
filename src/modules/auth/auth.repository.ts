import { prisma } from "@/lib/prisma";

type CreateSessionData = {
  userId: string;
  token: string;
  expiresAt: Date;
};

export async function createSession(data: CreateSessionData) {
  return prisma.session.create({
    data: {
      userId: data.userId,
      token: data.token,
      expiresAt: data.expiresAt,
    },
  });
}

export async function findSessionByToken(token: string) {
  return prisma.session.findUnique({
    where: { token },
  });
}

export async function invalidateSession(token: string) {
  return prisma.session.update({
    where: { token },
    data: { invalidatedAt: new Date() },
  });
}

export async function invalidateAllUserSessions(userId: string) {
  return prisma.session.updateMany({
    where: { userId, invalidatedAt: null, expiresAt: { gt: new Date() } },
    data: { invalidatedAt: new Date() },
  });
}
