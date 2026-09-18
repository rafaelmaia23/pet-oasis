import { Router } from "express";
import { getStatus } from "./status.controller";

const statusRouter = Router();

statusRouter.get("/", getStatus);

export default statusRouter;
