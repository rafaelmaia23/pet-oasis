import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { createUnauthorizedError } from "@/errors";
import { computeEffectiveFeatures } from "@/lib/authorization";
import { setActorId } from "@/lib/requestContext";
import { getUserForFeatureComputation } from "@/modules/user/user.repository";

/**
 * Dois modos do mesmo mecanismo, no mesmo arquivo de propósito: a resolução
 * token→ator é uma só, e duplicá-la seria duplicar `jwt.verify` +
 * `computeEffectiveFeatures` + `setActorId`. O que muda entre os dois é
 * exclusivamente o que se faz com a falha.
 *
 * - `authenticate` — falha vira 401. É o modo de tudo que não é vitrine.
 * - `optionalAuthenticate` — falha vira anônimo. Nasceu na 9.6 para a vitrine
 *   pública do catálogo (9.1/N15): o mesmo `GET /products` atende quem chegou
 *   pelo Google sem conta e o funcionário logado, e **nunca** responde 401.
 *
 * Rota montada com `optionalAuthenticate` lê `req.user` direto — nunca via
 * `getAuthUser`, que lança 401 quando ele falta.
 */

type AuthResolution =
  | { status: "anonymous" }
  | { status: "authenticated" }
  | { status: "invalid"; message: string };

async function resolveActor(req: Request): Promise<AuthResolution> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return { status: "anonymous" };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return {
      status: "invalid",
      message: "Token de autenticação ausente ou inválido",
    };
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return {
      status: "invalid",
      message: "Token de autenticação ausente ou inválido",
    };
  }

  let payload: jwt.JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    return {
      status: "invalid",
      message: "Token de autenticação inválido ou expirado",
    };
  }

  if (!payload.sub) {
    return {
      status: "invalid",
      message: "Token de autenticação inválido ou expirado",
    };
  }

  const userForFeatureComputation = await getUserForFeatureComputation(
    payload.sub,
  );

  if (!userForFeatureComputation) {
    return { status: "invalid", message: "Usuário não encontrado" };
  }

  req.user = {
    id: payload.sub,
    features: computeEffectiveFeatures(userForFeatureComputation),
  };

  // Identidade estabelecida: o contexto de observabilidade passa a saber quem
  // é o ator, para o access log, o application log e o audit log (7.6).
  setActorId(payload.sub);

  return { status: "authenticated" };
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const resolution = await resolveActor(req);

  if (resolution.status === "invalid") {
    throw createUnauthorizedError({ message: resolution.message });
  }

  next();
}

export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // Token ruim é indistinguível de visitante: a vitrine responde igual nos dois
  // casos. Quem exige identidade é o `canAccess` das rotas de escrita montadas
  // no mesmo router, que responde 401 sozinho quando `req.user` falta.
  await resolveActor(req);

  next();
}
