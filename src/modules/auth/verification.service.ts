import { env } from "@/config/env";
import { createBadRequestError } from "@/errors";
import { send } from "@/lib/email";
import { logger } from "@/lib/logger";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import { findUserByEmail } from "@/modules/user/user.repository";
import { EMAIL_VERIFICATION_TTL_MS } from "./auth.constants";
import * as authRepository from "./auth.repository";

const log = logger.child({ module: "verification" });

const INVALID_TOKEN_ERROR = {
  message: "Token de verificação inválido ou expirado",
  action: "Solicite um novo email de verificação",
};

function buildVerificationEmail(rawToken: string) {
  const link = `${env.APP_URL}/verify-email?token=${rawToken}`;

  return {
    subject: "Confirme seu email — Pet Oasis",
    html: `<p>Bem-vindo ao Pet Oasis!</p><p>Confirme seu email clicando no link abaixo:</p><p><a href="${link}">${link}</a></p><p>O link expira em 24 horas.</p>`,
    text: `Confirme seu email acessando: ${link} (expira em 24 horas).`,
  };
}

export async function issueEmailVerification(userId: string, email: string) {
  const rawToken = generateOpaqueToken();

  await authRepository.createVerificationToken({
    userId,
    tokenHash: hashToken(rawToken),
    purpose: "EMAIL_VERIFICATION",
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  });

  const { subject, html, text } = buildVerificationEmail(rawToken);

  await send({ to: email, subject, html, text });

  log.info({ userId }, "email verification sent");
}

export async function verifyEmail(token: string) {
  const verificationToken = await authRepository.findVerificationTokenByHash(
    hashToken(token),
  );

  if (
    !verificationToken ||
    verificationToken.purpose !== "EMAIL_VERIFICATION" ||
    verificationToken.usedAt !== null ||
    verificationToken.expiresAt < new Date()
  ) {
    log.warn(
      {
        ...(verificationToken ? { userId: verificationToken.userId } : {}),
        reason: verificationToken ? "USED_OR_EXPIRED" : "UNKNOWN_TOKEN",
      },
      "email verification refused",
    );
    throw createBadRequestError(INVALID_TOKEN_ERROR);
  }

  await authRepository.consumeEmailVerification(
    verificationToken.id,
    verificationToken.userId,
  );

  log.info(
    { userId: verificationToken.userId },
    "email verified, account activated",
  );
}

export async function resendVerification(email: string) {
  const user = await findUserByEmail(email);

  if (!user || user.status !== "PENDING" || user.bannedAt !== null) {
    return;
  }

  await issueEmailVerification(user.id, user.email);
}
