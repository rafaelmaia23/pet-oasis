import type { ListAuditLogsQuery } from "@pet-oasis/api-contracts/audit-log";
import { cursorEnvelope } from "@/lib/pagination";
import * as auditLogRepository from "./audit-log.repository";

export async function listAuditLogs(query: ListAuditLogsQuery) {
  const rows = await auditLogRepository.findAuditLogs(query);

  return cursorEnvelope(rows, query.limit);
}
