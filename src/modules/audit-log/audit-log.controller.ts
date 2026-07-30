import type { Request, Response } from "express";
import { hasFeature } from "@/lib/authorization";
import { getAuthUser } from "@/utils/getAuthUser";
import { auditLogPresenter, maskIp } from "./audit-log.presenter";
import { listAuditLogsSchema } from "./audit-log.schema";
import * as auditLogService from "./audit-log.service";

export const getAuditLogs = async (req: Request, res: Response) => {
  const { query } = listAuditLogsSchema.parse({ query: req.query });

  const canSeeFullIp = hasFeature(getAuthUser(req), "read:audit-log:full");

  const { data, meta } = await auditLogService.listAuditLogs(query);

  // Mascaramento na serialização (RBAC dentro da resposta): sem :full, o IP sai
  // mascarado. O par (createdAt, id) do cursor já foi calculado sobre o dado cru.
  const rows = data.map((row) => ({
    ...row,
    ip: canSeeFullIp ? row.ip : maskIp(row.ip),
  }));

  return res
    .status(200)
    .json({ data: auditLogPresenter.presentMany(rows, "default"), meta });
};
