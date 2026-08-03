import { Router } from "express";
import {
  emailIpLimiter,
  emailTargetLimiter,
  loginIpLimiter,
  rateLimitByEmailTarget,
  rateLimitByIp,
  signupIpLimiter,
} from "@/lib/rateLimit";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as authController from "./auth.controller";

const authRouter = Router();

authRouter.post(
  "/signup",
  rateLimitByIp(signupIpLimiter, "signup"),
  authController.signup,
);
authRouter.post(
  "/login",
  rateLimitByIp(loginIpLimiter, "login"),
  authController.login,
);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/verify-email", authController.verifyEmail);
authRouter.post(
  "/verify-email/resend",
  rateLimitByIp(emailIpLimiter, "verify-email-resend"),
  rateLimitByEmailTarget(emailTargetLimiter, "verify-email-resend"),
  authController.resendVerification,
);
authRouter.post(
  "/forgot-password",
  rateLimitByIp(emailIpLimiter, "forgot-password"),
  rateLimitByEmailTarget(emailTargetLimiter, "forgot-password"),
  authController.forgotPassword,
);
authRouter.post("/reset-password", authController.resetPassword);
authRouter.post(
  "/change-password",
  authenticate,
  authController.changePassword,
);
authRouter.post(
  "/change-email",
  authenticate,
  canAccess("update:user"),
  authController.changeEmail,
);
authRouter.post("/confirm-email-change", authController.confirmEmailChange);
authRouter.post(
  "/logout",
  authenticate,
  canAccess("manage:session"),
  authController.logout,
);
authRouter.get(
  "/sessions",
  authenticate,
  canAccess("read:session"),
  authController.listSessions,
);
authRouter.delete(
  "/sessions/:id",
  authenticate,
  canAccess("manage:session"),
  authController.revokeSession,
);

export default authRouter;
