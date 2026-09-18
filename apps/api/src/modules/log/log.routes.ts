import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as logController from "./log.controller";

const logRouter = Router();

logRouter.get("/recent", canAccess("read:log"), logController.getRecentLogs);

export default logRouter;
