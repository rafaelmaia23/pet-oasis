import { Router } from "express";
import { canAccess } from "@/middlewares/canAccess.middleware";
import * as auditLogController from "./audit-log.controller";

const auditLogRouter = Router();

// Só leitura — a trilha é append-only. A ausência de POST/PATCH/DELETE é
// imutabilidade intencional (docs/logging-policy.md §4.1), coberta por teste.
auditLogRouter.get(
  "/",
  canAccess("read:audit-log"),
  auditLogController.getAuditLogs,
);

export default auditLogRouter;
