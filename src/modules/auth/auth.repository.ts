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
    include: {
      user: {
        include: {
          features: {
            include: {
              feature: true,
            },
          },
        },
      },
    },
  });
}

// export async function deleteSessionByToken(token: string) {
//   return prisma.session.delete({
//     where: { token },
//   });
// }

// export async function deleteSessionsByUserId(userId: string) {
//   return prisma.session.deleteMany({
//     where: { userId },
//   });
// }

export async function invalidateSession(token: string) {
  return prisma.session.update({
    where: { token },
    data: { invalidatedAt: new Date() },
  });
}
