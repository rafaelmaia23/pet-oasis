import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "@/config/env";
import { computeEffectiveFeatures } from "@/lib/authorization";
import { findSessionByToken } from "@/modules/auth/auth.repository";
import { getUserForFeatureComputation } from "@/modules/user/user.repository";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Token de autenticação ausente ou inválido",
      code: "AUTH_TOKEN_MISSING",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({
      message: "Token de autenticação ausente ou inválido",
      code: "AUTH_TOKEN_MISSING",
    });
    return;
  }

  let payload: jwt.JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    res.status(401).json({
      message: "Token de autenticação inválido ou expirado",
      code: "AUTH_TOKEN_INVALID",
    });
    return;
  }

  if (!payload.sub) {
    res.status(401).json({
      message: "Token de autenticação inválido ou expirado",
      code: "AUTH_TOKEN_INVALID",
    });
    return;
  }

  const session = await findSessionByToken(token);

  if (!session) {
    res.status(401).json({
      message: "Sessão não encontrada ou expirada",
      code: "AUTH_SESSION_NOT_FOUND",
    });
    return;
  }

  if (session.expiresAt < new Date()) {
    res.status(401).json({
      message: "Sessão expirada",
      code: "AUTH_SESSION_EXPIRED",
    });
    return;
  }

  if (session.invalidatedAt) {
    res.status(401).json({
      message: "Sessão invalidada",
      code: "AUTH_SESSION_INVALIDATED",
    });
    return;
  }

  const userForFeatureComputation = await getUserForFeatureComputation(
    session.userId,
  );

  if (!userForFeatureComputation) {
    res.status(401).json({
      message: "Usuário não encontrado",
      code: "AUTH_USER_NOT_FOUND",
    });
    return;
  }

  const effectiveFeatures = computeEffectiveFeatures(userForFeatureComputation);

  req.user = {
    id: session.userId,
    features: effectiveFeatures,
  };

  next();
}
