import type { NextFunction, Request, Response } from "express";
import { can } from "@/lib/authorization";

export function canAccess(featureName: string) {
  return function canAccessMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      res.status(401).json({
        message: "Usuário não autenticado",
        code: "UNAUTHORIZED",
        action: "Faça login e tente novamente",
      });
      return;
    }

    if (!can(req.user, featureName)) {
      res.status(403).json({
        message: "Você não tem permissão para acessar este recurso",
        code: "FORBIDDEN",
        action: `Verifique se você tem acesso a feature "${featureName}"`,
      });
      return;
    }

    next();
  };
}
