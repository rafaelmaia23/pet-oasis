import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { getRecentLogs } from "./log.controller";

const logRouter = Router();

registerRoute(logRouter, routes.log.listRecent, {
  before: [authenticate, canAccess("read:log")],
  handler: getRecentLogs,
});

export default logRouter;
