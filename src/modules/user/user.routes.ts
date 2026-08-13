import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as userController from "./user.controller";

const userRouter = Router();

userRouter.post("/", canAccess("create:user"), userController.createEmployee);
userRouter.get("/", canAccess("read:user:others"), userController.getAllUsers);
userRouter.get("/:id", canAccess("read:user"), userController.getUserById);
userRouter.patch("/:id", canAccess("update:user"), userController.updateUser);
userRouter.delete("/:id", canAccess("delete:user"), userController.deleteUser);
userRouter.post(
  "/:id/ban",
  canAccess("manage:user:status"),
  userController.banUser,
);
userRouter.delete(
  "/:id/ban",
  canAccess("manage:user:status"),
  userController.unbanUser,
);
userRouter.delete(
  "/:id/lock",
  canAccess("manage:user:status"),
  userController.unlockAccount,
);
userRouter.post(
  "/:id/reactivate",
  canAccess("reactivate:user"),
  userController.reactivateAccount,
);
userRouter.post(
  "/:id/force-password-reset",
  canAccess("manage:user:status"),
  userController.forcePasswordReset,
);

export default userRouter;
