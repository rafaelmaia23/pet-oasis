import { signupSchema } from "@pet-oasis/api-contracts/auth";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { ACCESS_TOKEN_TTL_SECONDS } from "@/lib/accessToken";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import { userPresenter } from "../user/user.presenter";
import * as accountReactivationService from "./accountReactivation.service";
import { accessTokenPresenter } from "./auth.presenter";
import { readRefreshCookie, setRefreshCookie } from "./auth.refreshCookie";
import * as authService from "./auth.service";
import type { AuthTransport } from "./auth.transport";
import * as emailChangeService from "./emailChange.service";
import * as passwordService from "./password.service";
import * as verificationService from "./verification.service";

export const signup = async (req: Request, res: Response) => {
  const { body } = signupSchema.parse({ body: req.body });

  const result = await authService.signup(body);

  // Nada foi criado: o email pertencia a um usuário soft-deletado, o cpf bateu, e
  // saiu um email de reativação. 202 diz exatamente isso — pedido aceito, efeito
  // fora da request (K18). A mensagem é condicional para não confirmar que a
  // usuário existe.
  if (!result) {
    res.status(202).json({
      message:
        "Se houver uma conta correspondente, um email com instruções de reativação foi enviado",
    });
    return;
  }

  res.status(201).json(userPresenter.present(result, "owner"));
};

export const confirmAccountReactivation: RouteHandler<
  typeof routes.auth.confirmAccountReactivation
> = async ({ body }) => {
  await accountReactivationService.confirmAccountReactivation(
    body.token,
    body.newPassword,
    body.phone,
  );
};

export const verifyEmail: RouteHandler<
  typeof routes.auth.verifyEmail
> = async ({ body }) => {
  await verificationService.verifyEmail(body.token);
};

export const resendVerification: RouteHandler<
  typeof routes.auth.resendVerification
> = async ({ body }) => {
  await verificationService.resendVerification(body.email);

  return {
    message:
      "Se houver uma conta pendente com este email, um novo link de verificação foi enviado",
  };
};

export const forgotPassword: RouteHandler<
  typeof routes.auth.forgotPassword
> = async ({ body }) => {
  await passwordService.requestPasswordReset(body.email);

  return {
    message:
      "Se houver uma conta ativa com este email, um link de redefinição de senha foi enviado",
  };
};

export const resetPassword: RouteHandler<
  typeof routes.auth.resetPassword
> = async ({ body }) => {
  await passwordService.resetPassword(body.token, body.newPassword);
};

export const changePassword: RouteHandler<
  typeof routes.auth.changePassword
> = async ({ body, actor }) => {
  await passwordService.changePassword(
    actor.id,
    body.currentPassword,
    body.newPassword,
  );
};

export const changeEmail: RouteHandler<
  typeof routes.auth.changeEmail
> = async ({ body, actor }) => {
  await emailChangeService.changeEmail(
    actor.id,
    body.currentPassword,
    body.newEmail,
  );
};

export const confirmEmailChange: RouteHandler<
  typeof routes.auth.confirmEmailChange
> = async ({ body }) => {
  await emailChangeService.confirmEmailChange(body.token);
};

/**
 * O corpo de login e de refresh (11.16): o token e por quantos segundos ele
 * vale. `expiresIn` é o TTL configurado, não `exp - agora`: o par replicado
 * pela janela de graça anuncia o mesmo prazo que o par emitido, e o cliente
 * conta do recebimento — é a convenção OAuth2, imune a diferença de relógio.
 */
function accessTokenBody(accessToken: string) {
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export const login: RouteHandler<
  typeof routes.auth.login,
  AuthTransport
> = async ({ body, client, issueRefreshToken }) => {
  const { accessToken, refreshToken } = await authService.login(body, client);

  issueRefreshToken(refreshToken);

  return accessTokenBody(accessToken);
};

export const refresh = async (req: Request, res: Response) => {
  const refreshToken = readRefreshCookie(req);

  const { accessToken, refreshToken: newRefreshToken } =
    await authService.refresh(refreshToken, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

  setRefreshCookie(res, newRefreshToken);

  res
    .status(200)
    .json(
      accessTokenPresenter.present(accessTokenBody(accessToken), "default"),
    );
};

export const logout: RouteHandler<
  typeof routes.auth.logout,
  AuthTransport
> = async ({ actor, presentedRefreshToken, clearRefreshToken }) => {
  await authService.logout(presentedRefreshToken, actor.id);

  clearRefreshToken();
};

export const listSessions: RouteHandler<
  typeof routes.auth.listSessions,
  AuthTransport
> = async ({ actor, presentedRefreshToken }) => {
  const sessions = await authService.listSessions(
    actor.id,
    presentedRefreshToken,
  );

  return listEnvelope(sessions);
};

export const revokeSession: RouteHandler<
  typeof routes.auth.revokeSession
> = async ({ params, actor }) => {
  await authService.revokeSession(actor.id, params.id);
};
