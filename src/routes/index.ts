import { Router } from "express";
import authRouter from "@/modules/auth/auth.routes";
import featureRouter from "@/modules/feature/feature.routes";
import permissionRouter from "@/modules/permission/permission.routes";
import statusRouter from "@/modules/status/status.routes";
import userRouter from "@/modules/user/user.routes";

const v1Router = Router();

v1Router.use("/status", statusRouter);
v1Router.use("/auth", authRouter);
v1Router.use("/users", userRouter);
v1Router.use("/users/:userId", permissionRouter);
v1Router.use("/features", featureRouter);

export const router = Router();
router.use("/api/v1", v1Router);
