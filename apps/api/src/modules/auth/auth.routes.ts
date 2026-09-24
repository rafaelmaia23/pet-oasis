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
import { authTransport } from "./auth.transport";

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

registerRoute(authRouter, routes.auth.forgotPassword, {
  before: [
    rateLimitByIp(emailIpLimiter, "forgot-password"),
    rateLimitByEmailTarget(emailTargetLimiter, "forgot-password"),
  ],
  handler: authController.forgotPassword,
});

// As três rotas públicas de token dividem um balde por IP (K26): são anônimas,
// consomem credencial opaca e não têm outro freio na frente.
registerRoute(authRouter, routes.auth.resetPassword, {
  before: [rateLimitByIp(tokenIpLimiter, "reset-password")],
  handler: authController.resetPassword,
});

registerRoute(authRouter, routes.auth.confirmEmailChange, {
  before: [rateLimitByIp(tokenIpLimiter, "confirm-email-change")],
  handler: authController.confirmEmailChange,
});

// Pública: o token é a credencial — quem confirma é o dono de um `User` morto,
// que por definição não tem sessão nem consegue autenticar.
registerRoute(authRouter, routes.auth.confirmAccountReactivation, {
  before: [rateLimitByIp(tokenIpLimiter, "confirm-account-reactivation")],
  handler: authController.confirmAccountReactivation,
});

registerRoute(authRouter, routes.auth.changePassword, {
  before: [authenticate],
  handler: authController.changePassword,
});

registerRoute(authRouter, routes.auth.changeEmail, {
  before: [authenticate, canAccess("update:user")],
  handler: authController.changeEmail,
});

registerRoute(authRouter, routes.auth.logout, {
  before: [authenticate, canAccess("manage:session")],
  context: authTransport,
  handler: authController.logout,
});

registerRoute(authRouter, routes.auth.listSessions, {
  before: [authenticate, canAccess("read:session")],
  context: authTransport,
  handler: authController.listSessions,
});

registerRoute(authRouter, routes.auth.revokeSession, {
  before: [authenticate, canAccess("manage:session")],
  handler: authController.revokeSession,
});

registerRoute(authRouter, routes.auth.login, {
  before: [rateLimitByIp(loginIpLimiter, "login")],
  context: authTransport,
  handler: authController.login,
});

registerRoute(authRouter, routes.auth.refresh, {
  context: authTransport,
  handler: authController.refresh,
});

/** A forma antiga, com o path partido entre o prefixo e a chamada. */
export const legacyAuthRouter = Router();

legacyAuthRouter.post(
  "/signup",
  rateLimitByIp(signupIpLimiter, "signup"),
  authController.signup,
);

export default authRouter;
