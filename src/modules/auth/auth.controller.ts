import type { Request, Response } from "express";
import { env } from "@/config/env";
import { listEnvelope } from "@/lib/pagination";
import { getAuthUser } from "@/utils/getAuthUser";
import { userPresenter } from "../user/user.presenter";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from "./auth.constants";
import { sessionPresenter } from "./auth.presenter";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionParamsSchema,
  signupSchema,
  verifyEmailSchema,
} from "./auth.schema";
import * as authService from "./auth.service";
import * as passwordService from "./password.service";
import * as verificationService from "./verification.service";

export const signup = async (req: Request, res: Response) => {
  const { body } = signupSchema.parse({ body: req.body });

  const result = await authService.signup(body);

  res.status(201).json(userPresenter.present(result, "owner"));
};

export const verifyEmail = async (req: Request, res: Response) => {
  const { body } = verifyEmailSchema.parse({ body: req.body });

  await verificationService.verifyEmail(body.token);

  res.status(204).send();
};

export const resendVerification = async (req: Request, res: Response) => {
  const { body } = resendVerificationSchema.parse({ body: req.body });

  await verificationService.resendVerification(body.email);

  res.status(200).json({
    message:
      "Se houver uma conta pendente com este email, um novo link de verificação foi enviado",
  });
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

export const login = async (req: Request, res: Response) => {
  const { body } = loginSchema.parse({ body: req.body });

  const { accessToken, refreshToken } = await authService.login(body, {
    userAgent: req.headers["user-agent"],
    ipAddress: req.ip,
  });

  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });

  res.status(200).json({ accessToken });
};

export const refresh = async (req: Request, res: Response) => {
  const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME] as
    | string
    | undefined;

  const { accessToken, refreshToken: newRefreshToken } =
    await authService.refresh(refreshToken, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

  res.cookie(REFRESH_TOKEN_COOKIE_NAME, newRefreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });

  res.status(200).json({ accessToken });
};

export const logout = async (req: Request, res: Response) => {
  const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME] as
    | string
    | undefined;

  await authService.logout(refreshToken, getAuthUser(req).id);

  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
  res.status(204).send();
};

export const listSessions = async (req: Request, res: Response) => {
  const sessions = await authService.listSessions(getAuthUser(req).id);

  res
    .status(200)
    .json(listEnvelope(sessionPresenter.presentMany(sessions, "default")));
};

export const revokeSession = async (req: Request, res: Response) => {
  const { params } = sessionParamsSchema.parse({ params: req.params });

  await authService.revokeSession(getAuthUser(req).id, params.id);

  res.status(204).send();
};
