import { env } from "@/config/env";
import {
  createBadRequestError,
  createForbiddenError,
  createUnauthorizedError,
} from "@/errors";
import { send } from "@/lib/email";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import { findUserByEmail, findUserById } from "@/modules/user/user.repository";
import { PASSWORD_RESET_TTL_MS } from "./auth.constants";
import * as authRepository from "./auth.repository";

const INVALID_TOKEN_ERROR = {
  message: "Token de redefinição inválido ou expirado",
  action: "Solicite uma nova redefinição de senha",
};

const BANNED_ACCOUNT_ERROR = {
  message: "Conta suspensa",
  action: "Se você acha que isso é um erro, entre em contato com o suporte",
};

function buildPasswordResetEmail(rawToken: string) {
  const link = `${env.APP_URL}/reset-password?token=${rawToken}`;

  return {
    subject: "Redefinição de senha — Pet Oasis",
    html: `<p>Recebemos um pedido para redefinir sua senha.</p><p>Redefina clicando no link abaixo:</p><p><a href="${link}">${link}</a></p><p>O link expira em 1 hora. Se não foi você, ignore este email.</p>`,
    text: `Redefina sua senha acessando: ${link} (expira em 1 hora). Se não foi você, ignore este email.`,
  };
}

export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);

  if (!user || user.status !== "ACTIVE" || user.bannedAt !== null) {
    return;
  }

  const rawToken = generateOpaqueToken();

  await authRepository.createVerificationToken({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    purpose: "PASSWORD_RESET",
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  const { subject, html, text } = buildPasswordResetEmail(rawToken);

  await send({ to: user.email, subject, html, text });
}

export async function resetPassword(token: string, newPassword: string) {
  const resetToken = await authRepository.findVerificationTokenByHash(
    hashToken(token),
  );

  if (
    !resetToken ||
    resetToken.purpose !== "PASSWORD_RESET" ||
    resetToken.usedAt !== null ||
    resetToken.expiresAt < new Date()
  ) {
    throw createBadRequestError(INVALID_TOKEN_ERROR);
  }

  const user = await findUserById(resetToken.userId);

  if (!user) {
    throw createBadRequestError(INVALID_TOKEN_ERROR);
  }

  if (user.bannedAt !== null) {
    throw createForbiddenError(BANNED_ACCOUNT_ERROR);
  }

  const passwordHash = await hashPassword(newPassword);

  await authRepository.consumePasswordReset(
    resetToken.id,
    resetToken.userId,
    passwordHash,
  );
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
    throw createForbiddenError(BANNED_ACCOUNT_ERROR);
  }

  const passwordMatch = await verifyPassword(
    currentPassword,
    user.passwordHash,
  );

  if (!passwordMatch) {
    throw createForbiddenError({
      message: "Senha atual incorreta",
      action: "Verifique a senha atual e tente novamente",
    });
  }

  const passwordHash = await hashPassword(newPassword);

  await authRepository.updatePasswordAndInvalidateSessions(
    userId,
    passwordHash,
  );
}
