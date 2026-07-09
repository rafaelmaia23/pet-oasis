import { Router } from "express";
import { buildOpenApiDocument } from "@/docs/openapi";
import { authenticate } from "@/middlewares/authenticate.middleware";
import authRouter from "@/modules/auth/auth.routes";
import featureRouter from "@/modules/feature/feature.routes";
import meRouter from "@/modules/me/me.routes";
import permissionRouter from "@/modules/permission/permission.routes";
import roleRouter from "@/modules/role/role.routes";
import statusRouter from "@/modules/status/status.routes";
import userProfileRouter from "@/modules/user/profile/user.profile.routes";
import userRouter from "@/modules/user/user.routes";

const v1Router = Router();

// PÚBLICAS — sem authenticate
v1Router.use("/status", statusRouter);
v1Router.use("/auth", authRouter);

// PROTEGIDAS — com authenticate
v1Router.use("/me", authenticate, meRouter);
v1Router.use("/users", authenticate, userRouter);
v1Router.use("/users/:userId", authenticate, userProfileRouter);
v1Router.use("/users/:userId", authenticate, permissionRouter);
v1Router.use("/features", authenticate, featureRouter);
v1Router.use("/roles", authenticate, roleRouter);

export const router = Router();

// Documentação — pública, fora dos grupos protegidos por `authenticate`
router.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApiDocument());
});

router.use("/api/v1", v1Router);
