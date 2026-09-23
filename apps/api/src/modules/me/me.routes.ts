import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as meController from "./me.controller";

const meRouter = Router();

meRouter.get("/", canAccess("read:user"), meController.getMe);

export default meRouter;
