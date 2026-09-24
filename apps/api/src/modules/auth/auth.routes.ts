import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import {
  emailIpLimiter,
  emailTargetLimiter,
  loginIpLimiter,
  rateLimitByEmailTarget,
  rateLimitByIp,
  signupIpLimiter,
  tokenIpLimiter,
} from "@/lib/rateLimit";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as authController from "./auth.controller";

/**
 * O router **sem prefixo**: as rotas já declaradas num lugar só, com o path
 * inteiro vindo da entrada da tabela. Enquanto a migração corre (issue 10 de
 * `.scratch/fase-12-module-depth/`), ele convive com o `legacyAuthRouter`
 * abaixo, que ainda é montado em `/auth`. Os dois nunca disputam um path: uma
 * rota está num ou no outro.
 */
const authRouter = Router();

registerRoute(authRouter, routes.auth.verifyEmail, {
  handler: authController.verifyEmail,
});

registerRoute(authRouter, routes.auth.resendVerification, {
  before: [
    rateLimitByIp(emailIpLimiter, "verify-email-resend"),
    rateLimitByEmailTarget(emailTargetLimiter, "verify-email-resend"),
  ],
  handler: authController.resendVerification,
});

/** A forma antiga, com o path partido entre o prefixo e a chamada. */
export const legacyAuthRouter = Router();

legacyAuthRouter.post(
  "/signup",
  rateLimitByIp(signupIpLimiter, "signup"),
  authController.signup,
);
legacyAuthRouter.post(
  "/login",
  rateLimitByIp(loginIpLimiter, "login"),
  authController.login,
);
legacyAuthRouter.post("/refresh", authController.refresh);
legacyAuthRouter.post(
  "/forgot-password",
  rateLimitByIp(emailIpLimiter, "forgot-password"),
  rateLimitByEmailTarget(emailTargetLimiter, "forgot-password"),
  authController.forgotPassword,
);
// As três rotas públicas de token dividem um balde por IP (K26): são anônimas,
// consomem credencial opaca e não têm outro freio na frente.
legacyAuthRouter.post(
  "/reset-password",
  rateLimitByIp(tokenIpLimiter, "reset-password"),
  authController.resetPassword,
);
legacyAuthRouter.post(
  "/change-password",
  authenticate,
  authController.changePassword,
);
legacyAuthRouter.post(
  "/change-email",
  authenticate,
  canAccess("update:user"),
  authController.changeEmail,
);
legacyAuthRouter.post(
  "/confirm-email-change",
  rateLimitByIp(tokenIpLimiter, "confirm-email-change"),
  authController.confirmEmailChange,
);
// Pública: o token é a credencial — quem confirma é o dono de um `User` morto,
// que por definição não tem sessão nem consegue autenticar.
legacyAuthRouter.post(
  "/confirm-account-reactivation",
  rateLimitByIp(tokenIpLimiter, "confirm-account-reactivation"),
  authController.confirmAccountReactivation,
);
legacyAuthRouter.post(
  "/logout",
  authenticate,
  canAccess("manage:session"),
  authController.logout,
);
legacyAuthRouter.get(
  "/sessions",
  authenticate,
  canAccess("read:session"),
  authController.listSessions,
);
legacyAuthRouter.delete(
  "/sessions/:id",
  authenticate,
  canAccess("manage:session"),
  authController.revokeSession,
);

export default authRouter;
