import type { routes } from "@pet-oasis/api-contracts/routes";
import { hasFeature } from "@/lib/authorization";
import type { RouteHandler } from "@/lib/registerRoute";
import { maskIp } from "./audit-log.presenter";
import * as auditLogService from "./audit-log.service";

export const getAuditLogs: RouteHandler<typeof routes.auditLog.list> = async ({
  query,
  actor,
}) => {
  const canSeeFullIp = hasFeature(actor, "read:audit-log:full");

  const { data, meta } = await auditLogService.listAuditLogs(query);

  // Mascaramento na serialização (RBAC dentro da resposta): sem :full, o IP sai
  // mascarado. O par (createdAt, id) do cursor já foi calculado sobre o dado cru.
  return {
    data: data.map((row) => ({
      ...row,
      ip: canSeeFullIp ? row.ip : maskIp(row.ip),
    })),
    meta,
  };
};
