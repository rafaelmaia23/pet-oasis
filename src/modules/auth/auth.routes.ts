import { Router } from "express";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as authController from "./auth.controller";

const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/login", authController.login);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/verify-email", authController.verifyEmail);
authRouter.post("/verify-email/resend", authController.resendVerification);
authRouter.post("/forgot-password", authController.forgotPassword);
authRouter.post("/reset-password", authController.resetPassword);
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
