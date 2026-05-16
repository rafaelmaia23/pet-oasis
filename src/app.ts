import express from "express";
import { errorHandler } from "@/middlewares/errorHandler";
import userRouter from "@/modules/user/user.routes";
import healthRouter from "@/routes/v1/health.routes";

const app = express();

app.use(express.json());

app.use("/health", healthRouter);
app.use("/users", userRouter);

app.use(errorHandler);

export default app;
