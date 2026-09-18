import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as roleController from "./role.controller";

const roleRouter = Router();

roleRouter.get("/", canAccess("read:role"), roleController.getAllRoles);

roleRouter.get("/:id", canAccess("read:role"), roleController.getRoleById);

export default roleRouter;
