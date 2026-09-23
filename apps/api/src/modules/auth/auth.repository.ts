import type { ProfileKind } from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import {
  invalidateSessionsOfUser,
  liveSessionsOfUserWhere,
  liveSessionWhere,
} from "@/modules/auth/auth.liveSession.repository";
import type { VerificationTokenEffect } from "@/modules/auth/verificationToken.repository";
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
      where: liveSessionsOfUserWhere(data.userId),
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

/**
 * Marca que o elo já respondeu 503 dentro da janela de graça (10.18). **Só o
 * primeiro** 503 grava: a marca é fixa, não renova a cada retentativa — senão
 * quem controla o ritmo adiaria a detecção de roubo para sempre. O `where`
 * carrega a condição para que a decisão seja do banco, não de uma leitura
 * anterior que pode já estar velha.
 */
export async function markSessionGraceDeferred(sessionId: string) {
  return prisma.session.updateMany({
    where: { id: sessionId, graceDeferredAt: null },
    data: { graceDeferredAt: new Date() },
  });
}

export async function invalidateSession(sessionId: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { invalidatedAt: new Date() },
  });
}

/**
 * A cascata de reuso de refresh. Delega inteira, e existe mesmo assim: o
 * service chama a cascata sem estar numa transação, e é o repository — não
 * ele — quem tem o cliente do Prisma para entregar à operação.
 */
export async function invalidateAllUserSessions(userId: string) {
  return invalidateSessionsOfUser(prisma, userId, new Date());
}

/**
 * A sessão que `DELETE /auth/sessions/:id` pode revogar. O filtro de sessão
 * viva entra no `where`, e não numa conferência depois da busca, porque os dois
 * desfechos são o mesmo 404: revogar uma sessão que já morreu não é um caso
 * distinto de revogar uma que não existe.
 */
export async function findLiveSessionByIdForUser(id: string, userId: string) {
  return prisma.session.findFirst({
    where: { id, userId, ...liveSessionWhere() },
  });
}

/**
 * Os efeitos de cada `purpose` de `VerificationToken`: o que o consumo do token
 * aplica **dentro** da transação que marca o uso. Quem os roda é
 * `consumeToken` (`verificationToken.repository.ts`); quem escolhe qual, o
 * service do purpose.
 *
 * Eles não recebem o `userId` nem a escolha congelada: o token que autorizou a
 * ação vem junto, e é dele que tudo sai. Uma ação de reativação não pode
 * restaurar um perfil que o token não trouxe — e agora isso é a única leitura
 * possível, não uma combinação a manter alinhada entre service e repository.
 */

/** `EMAIL_VERIFICATION`: a prova de posse do email ativa a conta. */
export function activateUser(): VerificationTokenEffect<unknown> {
  return (tx, token) =>
    tx.user.update({
      where: { id: token.userId },
      data: { status: "ACTIVE" },
    });
}

/**
 * `EMAIL_CHANGE`, na **emissão**: o alvo fica pendente no `User` enquanto o
 * token vive. O endereço vai também no token, que é quem a confirmação lê.
 */
export function setPendingEmail(
  newEmail: string,
): VerificationTokenEffect<unknown> {
  return (tx, token) =>
    tx.user.update({
      where: { id: token.userId },
      data: { pendingEmail: newEmail },
    });
}

/**
 * `PASSWORD_RESET`: senha nova e toda sessão viva derrubada — a senha trocada
 * por quem tinha o link não deixa de pé a sessão de quem tinha a antiga.
 */
export function applyPasswordReset(
  passwordHash: string,
): VerificationTokenEffect<void> {
  return async (tx, token) => {
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await invalidateSessionsOfUser(tx, token.userId, new Date());
  };
}

/**
 * `EMAIL_CHANGE`, no **consumo**: promove o pendente a `email` e guarda o
 * antigo no histórico.
 *
 * Sem pré-checagem de conflito de última hora: se outra pessoa tomou o
 * `newEmail` entre o pedido e a confirmação, este `user.update` lança P2002, e
 * o error handler já o mapeia para 409 — mesmo idioma de toda unicidade do
 * projeto.
 */
export function applyEmailChange(
  newEmail: string,
  oldEmail: string,
): VerificationTokenEffect<void> {
  return async (tx, token) => {
    await tx.user.update({
      where: { id: token.userId },
      data: { email: newEmail, pendingEmail: null },
    });
    await tx.previousEmail.create({
      data: { userId: token.userId, email: oldEmail, replacedAt: new Date() },
    });
  };
}

export type AccountReactivationData = {
  passwordHash: string;
  newCustomer?: { phone: string };
  customerRoleIds: string[];
};

export type AccountReactivationCounts = {
  profilesRestored: ProfileKind[];
  profilesCreated: ProfileKind[];
  restoredRoles: number;
  grantedRoles: number;
  restoredPets: number;
};

/**
 * `ACCOUNT_REACTIVATION`: reativa o `User` inteiro. **Único ponto do projeto
 * que escreve `deletedAt: null` num `User`** — a inversa exata de
 * `softDeleteUserAndInvalidateSessions`.
 *
 * Não invalida sessões: a deleção do usuário já derrubou todas e nenhuma pôde
 * nascer enquanto o usuário estava morto.
 *
 * `status: ACTIVE` porque consumir o token **é** a prova de posse do email que
 * o `verify-email` exige; `mustChangePassword: false` porque a senha acabou de
 * ser trocada, mesmo raciocínio do `applyPasswordReset`.
 *
 * Que perfis e que roles voltam é a escolha do ator, congelada no token no
 * pedido — quem confirma é o dono da conta, não quem escolheu.
 */
export function applyAccountReactivation(
  data: AccountReactivationData,
): VerificationTokenEffect<AccountReactivationCounts> {
  return async (tx, token) => {
    await tx.user.update({
      where: { id: token.userId },
      data: {
        deletedAt: null,
        passwordHash: data.passwordHash,
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });

    const roleIds = token.restoreRoleIds;

    const restored = await restoreProfilesOfUser(tx, token.userId, {
      kinds: token.restoreProfiles,
      ...(roleIds.length > 0 && { roleIds }),
    });

    const profilesCreated: ProfileKind[] = [];

    if (data.newCustomer) {
      await tx.customer.create({
        data: { userId: token.userId, phone: data.newCustomer.phone },
      });
      await grantRolesToUser(tx, token.userId, data.customerRoleIds);
      profilesCreated.push("CUSTOMER");
    }

    // Role nomeada que não morreu na cascata de nenhum perfil restaurado não é
    // alcançada pela correlação por data — então é **concedida**, reusando a
    // linha do par (K15/K21). `grantRolesToUser` é idempotente, então passar o
    // conjunto nomeado inteiro é seguro.
    const grantedRoles = await grantRolesToUser(tx, token.userId, roleIds);

    return {
      profilesRestored: restored.profiles,
      profilesCreated,
      restoredRoles: restored.roles,
      grantedRoles,
      restoredPets: restored.pets,
    };
  };
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
    await invalidateSessionsOfUser(tx, userId, new Date());
    if (audit) await record(audit, tx);
  });
}

export async function findLiveSessionsByUserId(userId: string) {
  return prisma.session.findMany({
    where: liveSessionsOfUserWhere(userId),
    orderBy: { createdAt: "desc" },
  });
}
