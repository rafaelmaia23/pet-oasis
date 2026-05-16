import type { NextFunction, Request, Response } from "express";
import { AppError, InternalServerError } from "@/errors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Erro operacional — lançado intencionalmente pelo dev
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJson());
  }

  // Erro inesperado — esconde detalhes do usuário, loga internamente para debug
  console.error("🔥 Unexpected error:", err);

  const internalError = new InternalServerError({ cause: err });

  return res.status(internalError.statusCode).json(internalError.toJson());
}
