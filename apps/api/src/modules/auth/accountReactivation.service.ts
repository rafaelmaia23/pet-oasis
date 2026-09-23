import { env } from "@/config/env";
import {
  createBadRequestError,
  createForbiddenError,
  createValidationError,
} from "@/errors";
import type { ProfileKind } from "@/generated/prisma/enums";
import { send } from "@/lib/email";
import { logger } from "@/lib/logger";
import { hashPassword } from "@/lib/password";
import { getRolesByNames } from "@/modules/role/role.repository";
import { findDeletedUserById } from "@/modules/user/user.repository";
import type { AccountReactivationCounts } from "./auth.repository";
import * as authRepository from "./auth.repository";
import {
  consumeVerificationToken,
  issueVerificationToken,
} from "./verificationToken.service";

const log = logger.child({ module: "account-reactivation" });

const INVALID_TOKEN_ERROR = {
  message: "Token inválido ou expirado",
  action: "Solicite uma nova reativação de conta",
};

const BANNED_ACCOUNT_ERROR = {
  message: "Conta suspensa",
  action: "Se você acha que isso é um erro, entre em contato com o suporte",
};

/**
 * Quem pediu a reativação. O self-service é o signup reclamando o próprio `User`
 * (traz só o perfil de cliente, D11); `ADMIN` é o `POST /users/:id/reactivate`.
 */
export type ReactivationSource = "SELF" | "ADMIN";

/**
 * A escolha do ator, congelada no token: com que perfis o usuário volta e, quando
 * o ator estreitou, com que roles. `roleIds` vazio = default do D8 (todas as que
 * morreram na cascata de cada perfil).
 */
export type ReactivationChoice = {
  profiles: ProfileKind[];
  roleIds: string[];
};

function buildAccountReactivationEmail(
  rawToken: string,
  source: ReactivationSource,
) {
  const link = `${env.APP_URL}/confirm-account-reactivation?token=${rawToken}`;

  const intro =
    source === "SELF"
      ? "Detectamos uma tentativa de cadastro com um email associado a uma conta anterior."
      : "Um administrador iniciou a reativação da sua conta.";

  return {
    subject: "Reativação de conta — Pet Oasis",
    html: `<p>${intro}</p><p>Se foi você, reative sua conta e defina uma nova senha clicando no link abaixo:</p><p><a href="${link}">${link}</a></p><p>O link expira em 24 horas. Se não foi você, ignore este email.</p>`,
    text: `${intro} Reative sua conta e defina uma nova senha em: ${link} (expira em 24h). Se não foi você, ignore este email.`,
  };
}

/**
 * Emite o token de reativação e avisa o dono do `User`. Os dois caminhos (signup
 * e admin) convergem aqui — o que muda é só o `source` e a escolha congelada.
 *
 * Nada do usuário é tocado neste momento: quem reativa é a confirmação, com o
 * token na mão. Isso é o que permite ao admin iniciar a reativação sem decidir
 * a senha de outra pessoa.
 */
export async function requestAccountReactivation(
  user: { id: string; email: string },
  source: ReactivationSource,
  choice: ReactivationChoice,
) {
  // Mesmo idioma da troca de email: um pedido novo queima o anterior, então há
  // no máximo uma reativação pendente por usuário.
  const rawToken = await issueVerificationToken({
    userId: user.id,
    purpose: "ACCOUNT_REACTIVATION",
    supersedePending: true,
    restore: { profiles: choice.profiles, roleIds: choice.roleIds },
    audit: {
      action: "ACCOUNT_REACTIVATION_REQUESTED",
      targetType: "User",
      targetId: user.id,
      metadata: {
        source,
        profiles: choice.profiles,
        roles: choice.roleIds.length,
      },
    },
  });

  const { subject, html, text } = buildAccountReactivationEmail(
    rawToken,
    source,
  );

  await send({ to: user.email, subject, html, text });

  log.info({ userId: user.id, source }, "account reactivation requested");
}

/**
 * Confirma a reativação. Rota pública: o token **é** a credencial, e por isso a
 * senha nova vem junto (K17) — o usuário nunca volta com a credencial de antes,
 * que pode ter sido justamente o motivo da deleção.
 */
export async function confirmAccountReactivation(
  token: string,
  newPassword: string,
  phone?: string,
) {
  const { userId, restoreProfiles } = await consumeVerificationToken({
    rawToken: token,
    purpose: "ACCOUNT_REACTIVATION",
    invalidTokenError: INVALID_TOKEN_ERROR,
    plan: async (reactivationToken) => {
      // `findUserById` filtra `deletedAt: null` e não enxergaria o alvo.
      // Ausente aqui = usuário já reativado por um token anterior, ou apagado
      // de vez: a resposta é a mesma do token desconhecido, sem revelar qual
      // dos dois.
      const user = await findDeletedUserById(reactivationToken.userId);

      if (!user) {
        throw createBadRequestError(INVALID_TOKEN_ERROR);
      }

      if (user.bannedAt !== null) {
        log.warn(
          { userId: user.id },
          "account reactivation refused for banned account",
        );
        throw createForbiddenError(BANNED_ACCOUNT_ERROR);
      }

      // Mesmo idioma "uma rota, dois ramos" da 8.3: o estado do banco decide.
      // Há linha do perfil (morta, porque o usuário está morto) → restaura;
      // não há → nasce do zero. Criar do zero só vale para o de cliente: o de
      // funcionário é ato próprio, com o usuário vivo
      // (`POST /users/:id/employee`).
      const mustCreateCustomer =
        reactivationToken.restoreProfiles.includes("CUSTOMER") &&
        !user.customer;

      if (mustCreateCustomer && !phone) {
        throw createValidationError({
          errors: {
            phone: ["Telefone é obrigatório para criar o perfil de cliente"],
          },
        });
      }

      const customerRoleIds = mustCreateCustomer
        ? (await getRolesByNames(["customer"])).map((role) => role.id)
        : [];

      return {
        effect: authRepository.applyAccountReactivation({
          passwordHash: await hashPassword(newPassword),
          ...(mustCreateCustomer && phone && { newCustomer: { phone } }),
          customerRoleIds,
        }),
        // As contagens só existem dentro da transação, então o audit vai como
        // thunk — idioma do K6/K8. Restaurada ≠ concedida: só a segunda é
        // autoridade nova, decidida por alguém.
        audit: (counts: AccountReactivationCounts) => ({
          action: "ACCOUNT_REACTIVATION_COMPLETED" as const,
          targetType: "User" as const,
          targetId: user.id,
          metadata: { ...counts },
        }),
      };
    },
  });

  log.info(
    { userId, profiles: restoreProfiles },
    "account reactivation completed",
  );
}
