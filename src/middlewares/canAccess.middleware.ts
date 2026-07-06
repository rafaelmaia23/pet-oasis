import type { NextFunction, Request, Response } from "express";
import { createForbiddenError, createUnauthorizedError } from "@/errors";
import { can } from "@/lib/authorization";

export function canAccess(featureName: string) {
  return function canAccessMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      throw createUnauthorizedError({
        message: "Usuário não autenticado",
        action: "Faça login e tente novamente",
      });
    }

    if (!can(req.user, featureName)) {
      throw createForbiddenError({
        message: "Você não tem permissão para acessar este recurso",
        action: `Verifique se você tem acesso a feature "${featureName}"`,
      });
    }

    next();
  };
}
