import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  AppError,
  InternalServerError,
  type PresentationError,
} from "@/errors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Validation error",
      code: "VALIDATION_ERROR",
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  // Erro operacional — lançado intencionalmente pelo dev
  if (err instanceof AppError) {
    console.error({
      code: err.code,
      context: (err as PresentationError).context,
      cause: err.cause,
    });
    return res.status(err.statusCode).json(err.toJson());
  }

  // Erro inesperado — esconde detalhes do usuário, loga internamente para debug
  console.error("🔥 Unexpected error:", err);

  const internalError = new InternalServerError({ cause: err });

  return res.status(internalError.statusCode).json(internalError.toJson());
}
