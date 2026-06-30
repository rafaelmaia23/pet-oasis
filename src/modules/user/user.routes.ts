import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as userController from "./user.controller";

const userRouter = Router();

userRouter.post("/", canAccess("create:user"), userController.createEmployee);
userRouter.get("/", canAccess("read:user:others"), userController.getAllUsers);
userRouter.get("/:id", canAccess("read:user"), userController.getUserById);
userRouter.patch("/:id", canAccess("update:user"), userController.updateUser);
userRouter.delete("/:id", canAccess("delete:user"), userController.deleteUser);

export default userRouter;
