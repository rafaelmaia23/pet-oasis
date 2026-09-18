import { cursorEnvelope } from "@/lib/pagination";
import * as auditLogRepository from "./audit-log.repository";
import type { ListAuditLogsQuery } from "./audit-log.schema";

export async function listAuditLogs(query: ListAuditLogsQuery) {
  const rows = await auditLogRepository.findAuditLogs(query);

  return cursorEnvelope(rows, query.limit);
}
