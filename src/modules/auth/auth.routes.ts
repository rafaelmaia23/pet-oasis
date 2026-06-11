import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as authController from "./auth.controller";

const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/login", authController.login);
authRouter.post("/logout", canAccess("logout:session"), authController.logout);

export default authRouter;
