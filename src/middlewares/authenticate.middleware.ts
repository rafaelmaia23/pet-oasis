import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { createUnauthorizedError } from "@/errors";
import { computeEffectiveFeatures } from "@/lib/authorization";
import { setActorId } from "@/lib/requestContext";
import { getUserForFeatureComputation } from "@/modules/user/user.repository";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw createUnauthorizedError({
      message: "Token de autenticação ausente ou inválido",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    throw createUnauthorizedError({
      message: "Token de autenticação ausente ou inválido",
    });
  }

  let payload: jwt.JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    throw createUnauthorizedError({
      message: "Token de autenticação inválido ou expirado",
    });
  }

  if (!payload.sub) {
    throw createUnauthorizedError({
      message: "Token de autenticação inválido ou expirado",
    });
  }

  const userForFeatureComputation = await getUserForFeatureComputation(
    payload.sub,
  );

  if (!userForFeatureComputation) {
    throw createUnauthorizedError({
      message: "Usuário não encontrado",
    });
  }

  req.user = {
    id: payload.sub,
    features: computeEffectiveFeatures(userForFeatureComputation),
  };

  // Identidade estabelecida: o contexto de observabilidade passa a saber quem
  // é o ator, para o access log, o application log e o audit log (7.6).
  setActorId(payload.sub);

  next();
}
