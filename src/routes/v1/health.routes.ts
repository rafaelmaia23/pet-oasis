import { type Request, type Response, Router } from "express";
import { asyncHandler } from "@/utils/asyncHandler";

const healthRouter = Router();

const getHandler = async (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};

healthRouter.get(
  "/",
  asyncHandler(async () => getHandler),
);

export default healthRouter;
