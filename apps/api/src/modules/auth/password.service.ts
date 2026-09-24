import { env } from "@/config/env";
import {
  createBadRequestError,
  createForbiddenError,
  createUnauthorizedError,
} from "@/errors";
import { send } from "@/lib/email";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPassword } from "@/lib/password";
import { findUserByEmail, findUserById } from "@/modules/user/user.repository";
import * as authRepository from "./auth.repository";
import {
  consumeVerificationToken,
  issueVerificationToken,
} from "./verificationToken.service";

const log = logger.child({ module: "password" });

const INVALID_TOKEN_ERROR = {
  message: "Token de redefinição inválido ou expirado",
  action: "Solicite uma nova redefinição de senha",
};

const BANNED_ACCOUNT_ERROR = {
  message: "Conta suspensa",
  action: "Se você acha que isso é um erro, entre em contato com o suporte",
};

export function buildPasswordResetEmail(rawToken: string) {
  const link = `${env.APP_URL}/reset-password?token=${rawToken}`;

  return {
    subject: "Redefinição de senha — Pet Oasis",
    html: `<p>Recebemos um pedido para redefinir sua senha.</p><p>Redefina clicando no link abaixo:</p><p><a href="${link}">${link}</a></p><p>O link expira em 1 hora. Se não foi você, ignore este email.</p>`,
    text: `Redefina sua senha acessando: ${link} (expira em 1 hora). Se não foi você, ignore este email.`,
  };
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);

  if (user?.status !== "ACTIVE" || user.bannedAt !== null) {
    return;
  }

  const rawToken = await issueVerificationToken({
    userId: user.id,
    purpose: "PASSWORD_RESET",
    audit: {
      action: "PASSWORD_RESET_REQUESTED",
      targetType: "User",
      targetId: user.id,
    },
  });

  const { subject, html, text } = buildPasswordResetEmail(rawToken);

  await send({ to: user.email, subject, html, text });

  log.info({ userId: user.id }, "password reset requested");
}

export async function resetPassword(token: string, newPassword: string) {
  const { userId } = await consumeVerificationToken({
    rawToken: token,
    purpose: "PASSWORD_RESET",
    invalidTokenError: INVALID_TOKEN_ERROR,
    plan: async (resetToken) => {
      const user = await findUserById(resetToken.userId);

      if (!user) {
        throw createBadRequestError(INVALID_TOKEN_ERROR);
      }

      if (user.bannedAt !== null) {
        log.warn(
          { userId: user.id },
          "password reset refused for banned account",
        );
        throw createForbiddenError(BANNED_ACCOUNT_ERROR);
      }

      return {
        effect: authRepository.applyPasswordReset(
          await hashPassword(newPassword),
        ),
        audit: {
          action: "PASSWORD_RESET_COMPLETED",
          targetType: "User",
          targetId: user.id,
        },
      } as const;
    },
  });

  log.info({ userId }, "password reset completed, all sessions invalidated");
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await findUserById(userId);

  if (!user) {
    throw createUnauthorizedError({
      message: "Usuário não autenticado",
      action: "Faça login e tente novamente",
    });
  }

  if (user.bannedAt !== null) {
    log.warn({ userId }, "password change refused for banned account");
    throw createForbiddenError(BANNED_ACCOUNT_ERROR);
  }

  const passwordMatch = await verifyPassword(
    currentPassword,
    user.passwordHash,
  );

  if (!passwordMatch) {
    log.warn({ userId }, "password change refused, wrong current password");
    throw createForbiddenError({
      message: "Senha atual incorreta",
      action: "Verifique a senha atual e tente novamente",
    });
  }

  const passwordHash = await hashPassword(newPassword);

  await authRepository.updatePasswordAndInvalidateSessions(
    userId,
    passwordHash,
    { action: "PASSWORD_CHANGED", targetType: "User", targetId: userId },
  );

  log.info({ userId }, "password changed, all sessions invalidated");
}
