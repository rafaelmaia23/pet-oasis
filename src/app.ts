import cookieParser from "cookie-parser";
import express from "express";
import { env } from "@/config/env";
import { errorHandler } from "@/middlewares/error-handler.middleware";
import { router } from "@/routes";

const app = express();

// D7 — o deploy tem um proxy reverso na frente (ver docs/deploy.md), então
// `req.ip` deve vir do X-Forwarded-For que ELE escreve — é o IP real que o rate
// limit, o lockout e os logs precisam. O `1` é literal: confia em exatamente um
// salto. Sem proxy na frente isto seria um furo (header forjável pelo cliente).
app.set("trust proxy", 1);

app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
app.use(cookieParser());
app.use(router);
app.use(errorHandler);

export default app;
