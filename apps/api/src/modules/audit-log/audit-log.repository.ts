import type { Prisma } from "@/generated/prisma/client";
import { buildCursorFilter } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import type { ListAuditLogsQuery } from "./audit-log.schema";

/**
 * Busca uma página de audit logs por cursor (mais recentes primeiro), aplicando
 * os filtros. Busca `limit + 1` para o `cursorEnvelope` decidir `hasMore`. O
 * `buildCursorFilter` decodifica o cursor e lança 422 se estiver corrompido.
 */
export async function findAuditLogs(query: ListAuditLogsQuery) {
  const filters: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  const cursorFilter = buildCursorFilter(query.cursor);
  const where: Prisma.AuditLogWhereInput = cursorFilter
    ? { AND: [filters, cursorFilter] }
    : filters;

  return prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
}
