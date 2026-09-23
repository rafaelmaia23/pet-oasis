import { env } from "@/config/env";
import { send } from "@/lib/email";
import { logger } from "@/lib/logger";
import { findUserByEmail } from "@/modules/user/user.repository";
import { activateUser } from "./auth.repository";
import {
  consumeVerificationToken,
  issueVerificationToken,
} from "./verificationToken.service";

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

/**
 * O que disparou o envio, para a linha de log distinguir o email inicial (na
 * criação do usuário) de um reenvio pedido pelo usuário.
 */
type VerificationTrigger = "ACCOUNT_CREATION" | "RESEND";

export async function issueEmailVerification(
  userId: string,
  email: string,
  trigger: VerificationTrigger = "ACCOUNT_CREATION",
) {
  const rawToken = await issueVerificationToken({
    userId,
    purpose: "EMAIL_VERIFICATION",
  });

  const { subject, html, text } = buildVerificationEmail(rawToken);

  await send({ to: email, subject, html, text });

  log.info({ userId, trigger }, "email verification sent");
}

export async function verifyEmail(token: string) {
  const { userId } = await consumeVerificationToken({
    rawToken: token,
    purpose: "EMAIL_VERIFICATION",
    invalidTokenError: INVALID_TOKEN_ERROR,
    plan: async () => ({ effect: activateUser() }),
  });

  log.info({ userId }, "email verified, account activated");
}

export async function resendVerification(email: string) {
  const user = await findUserByEmail(email);

  if (user?.status !== "PENDING" || user.bannedAt !== null) {
    return;
  }

  await issueEmailVerification(user.id, user.email, "RESEND");
}
