import { env } from "@/config/env";
import {
  createBadRequestError,
  createConflictError,
  createForbiddenError,
  createUnauthorizedError,
} from "@/errors";
import { send } from "@/lib/email";
import { logger } from "@/lib/logger";
import { verifyPassword } from "@/lib/password";
import { findUserByEmail, findUserById } from "@/modules/user/user.repository";
import * as authRepository from "./auth.repository";
import {
  consumeVerificationToken,
  issueVerificationToken,
} from "./verificationToken.service";

const log = logger.child({ module: "email-change" });

const INVALID_TOKEN_ERROR = {
  message: "Token inválido ou expirado",
  action: "Solicite uma nova troca de email",
};

const BANNED_ACCOUNT_ERROR = {
  message: "Conta suspensa",
  action: "Se você acha que isso é um erro, entre em contato com o suporte",
};

const EMAIL_IN_USE_ERROR = {
  message: "O email informado já está em uso",
  action: "Tente outro valor para o campo email",
};

function buildEmailChangeNotice(rawToken: string, newEmail: string) {
  const link = `${env.APP_URL}/confirm-email-change?token=${rawToken}`;

  return {
    subject: "Solicitação de troca de email — Pet Oasis",
    html: `<p>Foi solicitada a troca do seu email de acesso para <strong>${newEmail}</strong>.</p><p>Se foi você, confirme clicando no link abaixo:</p><p><a href="${link}">${link}</a></p><p>Se você não solicitou isso, sua senha pode estar comprometida — troque-a agora e ignore este link.</p><p>O link expira em 24 horas.</p>`,
    text: `Foi solicitada a troca do seu email para ${newEmail}. Confirme em: ${link} (expira em 24h). Se não foi você, troque sua senha agora.`,
  };
}

export async function changeEmail(
  userId: string,
  currentPassword: string,
  newEmail: string,
) {
  const user = await findUserById(userId);

  if (!user) {
    throw createUnauthorizedError({
      message: "Usuário não autenticado",
      action: "Faça login e tente novamente",
    });
  }

  if (user.bannedAt !== null) {
    log.warn({ userId }, "email change refused for banned account");
    throw createForbiddenError(BANNED_ACCOUNT_ERROR);
  }

  const passwordMatch = await verifyPassword(
    currentPassword,
    user.passwordHash,
  );

  if (!passwordMatch) {
    log.warn({ userId }, "email change refused, wrong current password");
    throw createForbiddenError({
      message: "Senha atual incorreta",
      action: "Verifique a senha atual e tente novamente",
    });
  }

  if (newEmail === user.email) {
    throw createConflictError({
      message: "O novo email deve ser diferente do email atual",
      action: "Informe um email diferente",
    });
  }

  // Só o email ATIVO de alguém bloqueia (D13, 8.6): um endereço que outro usuário
  // já largou está em `PreviousEmail` como histórico e é reutilizável.
  if (await findUserByEmail(newEmail)) {
    throw createConflictError(EMAIL_IN_USE_ERROR);
  }

  // No máximo uma troca pendente por usuário: o pedido novo queima o token
  // anterior, o que de quebra é o cancelamento implícito de uma troca em curso.
  const rawToken = await issueVerificationToken({
    userId,
    purpose: "EMAIL_CHANGE",
    supersedePending: true,
    newEmail,
    effect: authRepository.setPendingEmail(newEmail),
    audit: {
      action: "EMAIL_CHANGE_REQUESTED",
      targetType: "User",
      targetId: userId,
    },
  });

  const { subject, html, text } = buildEmailChangeNotice(rawToken, newEmail);

  // Vai para o email ANTIGO (ainda ativo) — é quem tem acesso a essa caixa
  // que consegue confirmar a troca, e é o aviso que deixa o dono real reagir
  // antes de a troca virar definitiva.
  await send({ to: user.email, subject, html, text });

  log.info({ userId }, "email change requested");
}

export async function confirmEmailChange(token: string) {
  const { userId } = await consumeVerificationToken({
    rawToken: token,
    purpose: "EMAIL_CHANGE",
    invalidTokenError: INVALID_TOKEN_ERROR,
    plan: async (changeToken) => {
      const user = await findUserById(changeToken.userId);

      // Sem usuário ou sem o alvo congelado no token, não há o que promover — e
      // um `EMAIL_CHANGE` nesse estado é tão imprestável quanto um expirado, com
      // a mesma resposta.
      if (!user || !changeToken.newEmail) {
        throw createBadRequestError(INVALID_TOKEN_ERROR);
      }

      return {
        effect: authRepository.applyEmailChange(
          changeToken.newEmail,
          user.email,
        ),
        audit: {
          action: "EMAIL_CHANGE_COMPLETED",
          targetType: "User",
          targetId: changeToken.userId,
        },
      } as const;
    },
  });

  log.info({ userId }, "email change completed");
}
