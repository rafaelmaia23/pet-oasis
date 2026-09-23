import type { NextFunction, Request, Response } from "express";
import { createUnauthorizedError } from "@/errors";
import { can, createFeatureForbiddenError } from "@/lib/authorization";

/**
 * Porteiro da rota. Com uma lista, passa quem tiver **qualquer uma** das
 * features — é o que permite a uma rota só atender dois ramos (criar *ou*
 * reativar um perfil, 8.3) sem inventar um endpoint por ramo.
 *
 * O OR aqui é deliberadamente frouxo: `can` também aceita o sufixo `:others`,
 * então o middleware admite dono e privilegiado indistintamente. Quem separa os
 * dois é o service, com `authorizeThenLoad`, depois de saber qual ramo correu.
 *
 * O corpo do 403 sai de `createFeatureForbiddenError`: a frase que nomeia a
 * feature que faltou tem um dono só, compartilhado com a primitiva do service.
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
      throw createFeatureForbiddenError(features);
    }

    next();
  };
}
