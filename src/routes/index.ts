import { Router } from "express";
import authRouter from "@/modules/auth/auth.routes";
import featureRouter from "@/modules/feature/feature.routes";
import meRouter from "@/modules/me/me.routes";
import permissionRouter from "@/modules/permission/permission.routes";
import roleRouter from "@/modules/role/role.routes";
import statusRouter from "@/modules/status/status.routes";
import userProfileRouter from "@/modules/user/profile/user.profile.routes";
import userRouter from "@/modules/user/user.routes";

const v1Router = Router();

v1Router.use("/status", statusRouter);
v1Router.use("/auth", authRouter);
v1Router.use("/me", meRouter);
v1Router.use("/users", userRouter);
v1Router.use("/users/:userId", userProfileRouter);
v1Router.use("/users/:userId", permissionRouter);
v1Router.use("/features", featureRouter);
v1Router.use("/roles", roleRouter);

export const router = Router();
router.use("/api/v1", v1Router);
