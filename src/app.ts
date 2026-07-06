import cookieParser from "cookie-parser";
import express from "express";
import { errorHandler } from "@/middlewares/error-handler.middleware";
import { router } from "@/routes";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(router);
app.use(errorHandler);

export default app;
