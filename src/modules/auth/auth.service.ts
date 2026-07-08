import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { env } from "@/config/env";
import {
  createForbiddenError,
  createNotFoundError,
  createUnauthorizedError,
} from "@/errors";
import { verifyPassword } from "@/lib/password";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import * as userService from "@/modules/user/user.service";
import * as userRepository from "../user/user.repository";
import type { CreateCustomerInput } from "../user/user.schema";
import { REFRESH_TOKEN_TTL_MS } from "./auth.constants";
import * as authRepository from "./auth.repository";
import type { LoginInput } from "./auth.schema";

function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as StringValue,
  });
}

export async function signup(data: CreateCustomerInput) {
  const user = await userService.createCustomer(data);

  return user;
}

export async function login(
  data: LoginInput,
  context: { userAgent?: string | undefined; ipAddress?: string | undefined },
) {
  const user = await userRepository.findUserByEmail(data.email);

  if (!user) {
    throw createUnauthorizedError({
      message: "Credenciais inválidas",
      action: "Verifique seu email e senha e tente novamente",
    });
  }

  const passwordMatch = await verifyPassword(data.password, user.passwordHash);

  if (!passwordMatch) {
    throw createUnauthorizedError({
      message: "Credenciais inválidas",
      action: "Verifique seu email e senha e tente novamente",
    });
  }

  if (user.bannedAt !== null) {
    throw createForbiddenError({
      message: "Conta suspensa",
      action: "Se você acha que isso é um erro, entre em contato com o suporte",
    });
  }

  if (user.status !== "ACTIVE") {
    throw createForbiddenError({
      message: "Conta não verificada",
      action: "Verifique seu email para ativar a conta",
    });
  }

  const accessToken = generateToken(user.id);
  const refreshToken = generateOpaqueToken();

  await authRepository.createSession({
    userId: user.id,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  return { accessToken, refreshToken };
}

const REFRESH_INVALID_ERROR = {
  message: "Sessão inválida",
  action: "Faça login novamente",
};

export async function refresh(
  refreshToken: string | undefined,
  context: { userAgent?: string | undefined; ipAddress?: string | undefined },
) {
  if (!refreshToken) {
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  const session = await authRepository.findSessionByHash(
    hashToken(refreshToken),
  );

  if (!session) {
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  if (session.usedAt) {
    await authRepository.invalidateAllUserSessions(session.userId);
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  if (session.invalidatedAt) {
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  if (session.expiresAt < new Date()) {
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  const newRefreshToken = generateOpaqueToken();

  await authRepository.rotateSession(session.id, {
    userId: session.userId,
    refreshTokenHash: hashToken(newRefreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  const accessToken = generateToken(session.userId);

  return { accessToken, refreshToken: newRefreshToken };
}

const LOGOUT_INVALID_ERROR = {
  message: "Sessão inválida",
  action: "Faça login novamente",
};

export async function logout(refreshToken: string | undefined, userId: string) {
  if (!refreshToken) {
    throw createUnauthorizedError(LOGOUT_INVALID_ERROR);
  }

  const session = await authRepository.findSessionByHash(
    hashToken(refreshToken),
  );

  if (!session || session.userId !== userId) {
    throw createNotFoundError({
      message: "Sessão não encontrada",
      action: "Faça login para criar uma nova sessão",
    });
  }

  await authRepository.invalidateSession(session.id);
}

export async function listSessions(userId: string) {
  return authRepository.findLiveSessionsByUserId(userId);
}

const REVOKE_SESSION_NOT_FOUND_ERROR = {
  message: "Sessão não encontrada",
  action: "Verifique o ID e tente novamente",
};

export async function revokeSession(userId: string, sessionId: string) {
  const session = await authRepository.findSessionByIdForUser(
    sessionId,
    userId,
  );

  if (!session) {
    throw createNotFoundError(REVOKE_SESSION_NOT_FOUND_ERROR);
  }

  const isLive =
    !session.usedAt && !session.invalidatedAt && session.expiresAt > new Date();

  if (!isLive) {
    throw createNotFoundError(REVOKE_SESSION_NOT_FOUND_ERROR);
  }

  await authRepository.invalidateSession(session.id);
}
