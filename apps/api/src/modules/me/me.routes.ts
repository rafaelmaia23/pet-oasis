import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { getMe } from "./me.controller";

const meRouter = Router();

registerRoute(meRouter, routes.me.get, {
  before: [authenticate, canAccess("read:user")],
  handler: getMe,
});

export default meRouter;
