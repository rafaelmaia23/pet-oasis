import type { routes } from "@pet-oasis/api-contracts/routes";
import type { RouteHandler } from "@/lib/registerRoute";
import * as logService from "./log.service";

export const getRecentLogs: RouteHandler<typeof routes.log.listRecent> = ({
  query,
}) => logService.listRecentLogs(query);
