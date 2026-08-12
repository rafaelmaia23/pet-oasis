import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { env } from "@/config/env";
import {
  createForbiddenError,
  createNotFoundError,
  createTooManyRequestsError,
  createUnauthorizedError,
} from "@/errors";
import { record } from "@/lib/auditLog";
import * as lockout from "@/lib/lockout";
import { logger } from "@/lib/logger";
import { verifyPassword } from "@/lib/password";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import { describeUserAgent } from "@/lib/userAgent";
import * as userService from "@/modules/user/user.service";
import * as userRepository from "../user/user.repository";
import type { CreateCustomerInput } from "../user/user.schema";
import { REFRESH_TOKEN_TTL_MS } from "./auth.constants";
import * as authRepository from "./auth.repository";
import type { LoginInput } from "./auth.schema";

const log = logger.child({ module: "auth" });

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
    // Sem `userId`: não há conta. O email fica de fora de propósito — a linha
    // não precisa dele para contar a história, e ele é PII.
    log.warn({ reason: "UNKNOWN_EMAIL" }, "login failed");
    // Sem ator e sem alvo: evidência de tentativa de adivinhação de credencial.
    await record({
      action: "AUTH_LOGIN_FAILED",
      targetType: "User",
      metadata: { reason: "BAD_CREDENTIALS" },
    });
    throw createUnauthorizedError({
      message: "Credenciais inválidas",
      action: "Verifique seu email e senha e tente novamente",
    });
  }

  const lockoutExempt = lockout.isLockoutExempt(user);

  const passwordMatch = await verifyPassword(data.password, user.passwordHash);

  if (!passwordMatch) {
    log.warn({ userId: user.id, reason: "BAD_PASSWORD" }, "login failed");
    await record({
      action: "AUTH_LOGIN_FAILED",
      targetType: "User",
      targetId: user.id,
      metadata: { reason: "BAD_CREDENTIALS" },
    });
    // Conta as falhas mesmo sem checar o estado de travamento aqui: quem não
    // sabe a senha continua recebendo 401 igual a hoje, sem pista sobre a
    // conta (mesmo espírito anti-enumeração do bannedAt/status abaixo). O
    // papel do lockout é impedir que uma senha eventualmente certa complete o
    // login dentro da janela de bloqueio — só precisa ser checado no ramo de
    // senha correta. Conta demo (8.8) é isenta: a senha é pública, então o
    // lockout ali não protege credencial nenhuma — só abriria DoS.
    if (!lockoutExempt) {
      await lockout.recordFailure(user.id);
    }
    throw createUnauthorizedError({
      message: "Credenciais inválidas",
      action: "Verifique seu email e senha e tente novamente",
    });
  }

  if (!lockoutExempt) {
    const lockoutState = await lockout.getLockoutState(user.id);
    if (lockoutState.isLocked) {
      log.warn({ userId: user.id, reason: "LOCKED" }, "login refused");
      await record({
        action: "AUTH_LOGIN_FAILED",
        targetType: "User",
        targetId: user.id,
        metadata: { reason: "LOCKED" },
      });
      throw createTooManyRequestsError();
    }
  }

  if (user.bannedAt !== null) {
    log.warn({ userId: user.id, reason: "BANNED" }, "login refused");
    await record({
      action: "AUTH_LOGIN_FAILED",
      targetType: "User",
      targetId: user.id,
      metadata: { reason: "BANNED" },
    });
    throw createForbiddenError({
      message: "Conta suspensa",
      action: "Se você acha que isso é um erro, entre em contato com o suporte",
    });
  }

  if (user.mustChangePassword) {
    log.warn(
      { userId: user.id, reason: "MUST_CHANGE_PASSWORD" },
      "login refused",
    );
    throw createForbiddenError({
      message: "Você precisa definir uma nova senha",
      action: "Verifique seu email para o link de redefinição de senha",
    });
  }

  if (user.status !== "ACTIVE") {
    log.warn(
      { userId: user.id, reason: "NOT_VERIFIED", status: user.status },
      "login refused",
    );
    throw createForbiddenError({
      message: "Conta não verificada",
      action: "Verifique seu email para ativar a conta",
    });
  }

  // Login legítimo: se havia contador/backoff de tentativas erradas, limpa.
  // Login limpo de uma conta que nunca falhou não grava nada (no-op).
  await lockout.clearLockout(user.id, "SUCCESSFUL_LOGIN");

  const accessToken = generateToken(user.id);
  const refreshToken = generateOpaqueToken();

  const { evictedCount } = await authRepository.createSessionAndEvictOldest(
    {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    },
    env.MAX_LIVE_SESSIONS,
  );

  if (evictedCount > 0) {
    log.info(
      { userId: user.id, evictedCount },
      "oldest live session(s) evicted (live session cap exceeded)",
    );
  }

  log.info({ userId: user.id }, "login succeeded");

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
    // Um refresh token só é apresentado uma vez; a segunda apresentação
    // significa que alguém tem uma cópia. Anomalia tratada (todas as sessões
    // caem) — mas é o sinal mais importante deste módulo.
    log.warn(
      { userId: session.userId, sessionId: session.id },
      "refresh token reuse detected, invalidating all sessions",
    );
    await authRepository.invalidateAllUserSessions(session.userId);
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  if (session.invalidatedAt) {
    log.warn(
      { userId: session.userId, reason: "INVALIDATED" },
      "refresh refused",
    );
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  if (session.expiresAt < new Date()) {
    log.warn({ userId: session.userId, reason: "EXPIRED" }, "refresh refused");
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

  log.info(
    { userId: session.userId, sessionId: session.id },
    "refresh token rotated",
  );

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

  log.info({ userId, sessionId: session.id }, "logout");
}

export async function listSessions(
  userId: string,
  currentRefreshToken?: string,
) {
  const sessions = await authRepository.findLiveSessionsByUserId(userId);
  const currentHash = currentRefreshToken
    ? hashToken(currentRefreshToken)
    : null;

  return sessions.map((session) => ({
    ...session,
    device: describeUserAgent(session.userAgent),
    current: currentHash !== null && session.refreshTokenHash === currentHash,
  }));
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

  log.info({ userId, sessionId: session.id }, "session revoked");
}
