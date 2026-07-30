import type { Request, Response } from "express";
import { listRecentLogsSchema } from "./log.schema";
import * as logService from "./log.service";

export const getRecentLogs = (req: Request, res: Response) => {
  const { query } = listRecentLogsSchema.parse({ query: req.query });

  const { data, meta } = logService.listRecentLogs(query);

  return res.status(200).json({ data, meta });
};
