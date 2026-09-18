import type { NextFunction, Request, Response } from "express";
import { createForbiddenError, createUnauthorizedError } from "@/errors";
import { can } from "@/lib/authorization";

/**
 * Porteiro da rota. Com uma lista, passa quem tiver **qualquer uma** das
 * features — é o que permite a uma rota só atender dois ramos (criar *ou*
 * reativar um perfil, 8.3) sem inventar um endpoint por ramo.
 *
 * O OR aqui é deliberadamente frouxo: `can` também aceita o sufixo `:others`,
 * então o middleware admite dono e privilegiado indistintamente. Quem separa os
 * dois é o service, com `canActOnResource`, depois de saber qual ramo correu.
 */
export function canAccess(featureName: string | string[]) {
  const features = Array.isArray(featureName) ? featureName : [featureName];

  return function canAccessMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    const user = req.user;

    if (!user) {
      throw createUnauthorizedError({
        message: "Usuário não autenticado",
        action: "Faça login e tente novamente",
      });
    }

    if (!features.some((feature) => can(user, feature))) {
      throw createForbiddenError({
        message: "Você não tem permissão para acessar este recurso",
        action:
          features.length === 1
            ? `Verifique se você tem acesso a feature "${features[0]}"`
            : `Verifique se você tem acesso a uma das features: ${features
                .map((feature) => `"${feature}"`)
                .join(", ")}`,
      });
    }

    next();
  };
}
