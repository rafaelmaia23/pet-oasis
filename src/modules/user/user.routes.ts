import { Router } from "express";
import * as userController from "./user.controller";

const userRouter = Router();

// rotas públicas
userRouter.post("/", userController.createUser);

// TODO proteger com authenticate + canAccess (own/any) do módulo authorization
userRouter.get("/", userController.getAllUsers);
userRouter.get("/:id", userController.getUserById);
userRouter.patch("/:id", userController.updateUser);
userRouter.delete("/:id", userController.deleteUser);

export default userRouter;
