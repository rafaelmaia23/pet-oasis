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
 * As catorze rotas de autenticação, cada uma declarada **num lugar só**: a
 * entrada da tabela do contrato dá método, path, schema de request, status de
 * sucesso e view; aqui ficam o que é do servidor (`before`) e o que é do
 * transporte (`context`), que a tabela não conhece.
 *
 * O router é montado **sem prefixo** — o path inteiro vem da entrada.
 */
const authRouter = Router();

// O único par de status de sucesso da API: 201 quando a conta nasce, 202
// quando o email pertencia a um usuário soft-deletado e o que saiu foi um
// email de reativação. Quem sabe qual dos dois aconteceu é o caso de uso, e é
// por isso que o handler devolve o desfecho etiquetado.
registerRoute(authRouter, routes.auth.signup, {
  before: [rateLimitByIp(signupIpLimiter, "signup")],
  handler: authController.signup,
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

registerRoute(authRouter, routes.auth.changePassword, {
  before: [authenticate],
  handler: authController.changePassword,
});

registerRoute(authRouter, routes.auth.changeEmail, {
  before: [authenticate, canAccess("update:user")],
  handler: authController.changeEmail,
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

export default authRouter;
