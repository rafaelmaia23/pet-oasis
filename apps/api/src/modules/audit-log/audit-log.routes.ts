import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { canAccess } from "@/middlewares/canAccess.middleware";
import { getAuditLogs } from "./audit-log.controller";

const auditLogRouter = Router();

// Só leitura — a trilha é append-only. A ausência de POST/PATCH/DELETE é
// imutabilidade intencional (docs/reference/logging-policy.md §4.1), coberta por teste.
registerRoute(auditLogRouter, routes.auditLog.list, {
  before: [authenticate, canAccess("read:audit-log")],
  handler: getAuditLogs,
});

export default auditLogRouter;
