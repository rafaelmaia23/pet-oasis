import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { registerRoute } from "@/lib/registerRoute";
import { getStatus } from "./status.controller";

const statusRouter = Router();

// Montado na raiz de `/api/v1` (e não em `/status`): o path vem da entrada da
// tabela, que o declara inteiro.
registerRoute(statusRouter, routes.status.get, { handler: getStatus });

export default statusRouter;
