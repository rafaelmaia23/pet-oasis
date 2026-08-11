import type {
  ProfileKind,
  VerificationPurpose,
} from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import {
  grantRolesToUser,
  restoreProfilesOfUser,
} from "@/modules/user/user.lifecycle.repository";

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
  newEmail?: string;
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
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.session.updateMany({
      where: { userId, invalidatedAt: null, expiresAt: { gt: new Date() } },
      data: { invalidatedAt: new Date() },
    });
    if (audit) await record(audit, tx);
  });
}

type RequestEmailChangeData = {
  userId: string;
  tokenHash: string;
  newEmail: string;
  expiresAt: Date;
};

/**
 * Invalidates any pending EMAIL_CHANGE token for the user before creating the
 * new one — at most one live pending email change per user (same "unicidade
 * do ativo por código" idiom already used by UserFeature/UserRole), which
 * also doubles as the implicit cancel mechanism for a change in progress.
 */
export async function requestEmailChange(
  data: RequestEmailChangeData,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.verificationToken.updateMany({
      where: { userId: data.userId, purpose: "EMAIL_CHANGE", usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.user.update({
      where: { id: data.userId },
      data: { pendingEmail: data.newEmail },
    });
    const token = await tx.verificationToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        purpose: "EMAIL_CHANGE",
        expiresAt: data.expiresAt,
        newEmail: data.newEmail,
      },
    });
    if (audit) await record(audit, tx);
    return token;
  });
}

/**
 * No pre-check for a last-minute conflict here: if someone else took
 * `newEmail` between the request and the confirmation, this `user.update`
 * throws P2002, which the error handler already maps to 409 — same idiom
 * used everywhere else unique constraints are the backstop.
 */
export async function consumeEmailChange(
  tokenId: string,
  userId: string,
  newEmail: string,
  oldEmail: string,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.verificationToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    });
    await tx.user.update({
      where: { id: userId },
      data: { email: newEmail, pendingEmail: null },
    });
    await tx.previousEmail.create({
      data: { userId, email: oldEmail, replacedAt: new Date() },
    });
    if (audit) await record(audit, tx);
  });
}

type RequestAccountReactivationData = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  restoreProfiles: ProfileKind[];
  restoreRoleIds: string[];
};

/**
 * Mesmo idioma do `requestEmailChange`: invalida o token de reativação pendente
 * antes de criar o novo, então há no máximo um vivo por conta e um segundo
 * pedido cancela o primeiro implicitamente.
 *
 * A escolha do ator viaja no token porque quem confirma é outra pessoa — o dono
 * da conta, que só tem o link do email.
 */
export async function requestAccountReactivation(
  data: RequestAccountReactivationData,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.verificationToken.updateMany({
      where: {
        userId: data.userId,
        purpose: "ACCOUNT_REACTIVATION",
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    const token = await tx.verificationToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        purpose: "ACCOUNT_REACTIVATION",
        expiresAt: data.expiresAt,
        restoreProfiles: data.restoreProfiles,
        restoreRoleIds: data.restoreRoleIds,
      },
    });
    if (audit) await record(audit, tx);
    return token;
  });
}

type ConsumeAccountReactivationData = {
  tokenId: string;
  userId: string;
  passwordHash: string;
  kinds: ProfileKind[];
  roleIds: string[];
  newCustomer?: { phone: string };
  customerRoleIds: string[];
};

/**
 * Reativa a conta inteira numa transação. **Único ponto do projeto que escreve
 * `deletedAt: null` num `User`** — a inversa exata de
 * `softDeleteUserAndInvalidateSessions`.
 *
 * Não invalida sessões: a deleção da conta já derrubou todas e nenhuma pôde
 * nascer enquanto a conta estava morta.
 *
 * `status: ACTIVE` porque consumir o token **é** a prova de posse do email que
 * o `verify-email` exige; `mustChangePassword: false` porque a senha acabou de
 * ser trocada, mesmo raciocínio do `consumePasswordReset`.
 */
export async function consumeAccountReactivation(
  data: ConsumeAccountReactivationData,
  describeAudit?: (counts: {
    profilesRestored: ProfileKind[];
    profilesCreated: ProfileKind[];
    restoredRoles: number;
    grantedRoles: number;
  }) => AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.verificationToken.update({
      where: { id: data.tokenId },
      data: { usedAt: new Date() },
    });

    await tx.user.update({
      where: { id: data.userId },
      data: {
        deletedAt: null,
        passwordHash: data.passwordHash,
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });

    const restored = await restoreProfilesOfUser(tx, data.userId, {
      kinds: data.kinds,
      ...(data.roleIds.length > 0 && { roleIds: data.roleIds }),
    });

    const profilesCreated: ProfileKind[] = [];

    if (data.newCustomer) {
      await tx.customer.create({
        data: { userId: data.userId, phone: data.newCustomer.phone },
      });
      await grantRolesToUser(tx, data.userId, data.customerRoleIds);
      profilesCreated.push("CUSTOMER");
    }

    // Role nomeada que não morreu na cascata de nenhum perfil restaurado não é
    // alcançada pela correlação por data — então é **concedida**, reusando a
    // linha do par (K15/K21). `grantRolesToUser` é idempotente, então passar o
    // conjunto nomeado inteiro é seguro.
    const grantedRoles = await grantRolesToUser(tx, data.userId, data.roleIds);

    if (describeAudit) {
      await record(
        describeAudit({
          profilesRestored: restored.profiles,
          profilesCreated,
          restoredRoles: restored.roles,
          grantedRoles,
        }),
        tx,
      );
    }
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
