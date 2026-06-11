import express from "express";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { errorHandler } from "@/middlewares/error-handler.middleware";
import { router } from "@/routes";

const app = express();

app.use(express.json());
app.use(authenticate);
app.use(router);
app.use(errorHandler);

export default app;
