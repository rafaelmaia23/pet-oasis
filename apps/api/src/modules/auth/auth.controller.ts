import {
  changeEmailSchema,
  changePasswordSchema,
  confirmAccountReactivationSchema,
  confirmEmailChangeSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  sessionParamsSchema,
  signupSchema,
} from "@pet-oasis/api-contracts/auth";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { ACCESS_TOKEN_TTL_SECONDS } from "@/lib/accessToken";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import { getAuthUser } from "@/utils/getAuthUser";
import { userPresenter } from "../user/user.presenter";
import * as accountReactivationService from "./accountReactivation.service";
import { accessTokenPresenter, sessionPresenter } from "./auth.presenter";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "./auth.refreshCookie";
import * as authService from "./auth.service";
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

export const confirmAccountReactivation = async (
  req: Request,
  res: Response,
) => {
  const { body } = confirmAccountReactivationSchema.parse({ body: req.body });

  await accountReactivationService.confirmAccountReactivation(
    body.token,
    body.newPassword,
    body.phone,
  );

  res.status(204).send();
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

export const forgotPassword = async (req: Request, res: Response) => {
  const { body } = forgotPasswordSchema.parse({ body: req.body });

  await passwordService.requestPasswordReset(body.email);

  res.status(200).json({
    message:
      "Se houver uma conta ativa com este email, um link de redefinição de senha foi enviado",
  });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { body } = resetPasswordSchema.parse({ body: req.body });

  await passwordService.resetPassword(body.token, body.newPassword);

  res.status(204).send();
};

export const changePassword = async (req: Request, res: Response) => {
  const { body } = changePasswordSchema.parse({ body: req.body });

  await passwordService.changePassword(
    getAuthUser(req).id,
    body.currentPassword,
    body.newPassword,
  );

  res.status(204).send();
};

export const changeEmail = async (req: Request, res: Response) => {
  const { body } = changeEmailSchema.parse({ body: req.body });

  await emailChangeService.changeEmail(
    getAuthUser(req).id,
    body.currentPassword,
    body.newEmail,
  );

  res.status(204).send();
};

export const confirmEmailChange = async (req: Request, res: Response) => {
  const { body } = confirmEmailChangeSchema.parse({ body: req.body });

  await emailChangeService.confirmEmailChange(body.token);

  res.status(204).send();
};

/**
 * O corpo de login e de refresh (11.16): o token e por quantos segundos ele
 * vale. `expiresIn` é o TTL configurado, não `exp - agora`: o par replicado
 * pela janela de graça anuncia o mesmo prazo que o par emitido, e o cliente
 * conta do recebimento — é a convenção OAuth2, imune a diferença de relógio.
 */
function presentAccessToken(accessToken: string) {
  return accessTokenPresenter.present(
    { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    "default",
  );
}

export const login = async (req: Request, res: Response) => {
  const { body } = loginSchema.parse({ body: req.body });

  const { accessToken, refreshToken } = await authService.login(body, {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
  });

  setRefreshCookie(res, refreshToken);

  res.status(200).json(presentAccessToken(accessToken));
};

export const refresh = async (req: Request, res: Response) => {
  const refreshToken = readRefreshCookie(req);

  const { accessToken, refreshToken: newRefreshToken } =
    await authService.refresh(refreshToken, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

  setRefreshCookie(res, newRefreshToken);

  res.status(200).json(presentAccessToken(accessToken));
};

export const logout = async (req: Request, res: Response) => {
  const refreshToken = readRefreshCookie(req);

  await authService.logout(refreshToken, getAuthUser(req).id);

  clearRefreshCookie(res);
  res.status(204).send();
};

export const listSessions = async (req: Request, res: Response) => {
  const currentRefreshToken = readRefreshCookie(req);

  const sessions = await authService.listSessions(
    getAuthUser(req).id,
    currentRefreshToken,
  );

  res
    .status(200)
    .json(listEnvelope(sessionPresenter.presentMany(sessions, "default")));
};

export const revokeSession = async (req: Request, res: Response) => {
  const { params } = sessionParamsSchema.parse({ params: req.params });

  await authService.revokeSession(getAuthUser(req).id, params.id);

  res.status(204).send();
};
