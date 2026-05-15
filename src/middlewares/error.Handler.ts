import type { NextFunction, Request, Response } from "express";
import { AppError } from "@/errors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Erro controlado da aplicação
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJson());
  }

  // Erro inesperado (bug real)
  console.error("🔥 Unexpected error:", err);

  return res.status(500).json({
    name: "InternalServerError",
    message: "Internal server error",
    statusCode: 500,
  });
}
