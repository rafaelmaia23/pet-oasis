import type { routes } from "@pet-oasis/api-contracts/routes";
import type { RouteHandler } from "@/lib/registerRoute";
import * as meService from "./me.service";

export const getMe: RouteHandler<typeof routes.me.get> = async ({ actor }) =>
  meService.getMe(actor);
