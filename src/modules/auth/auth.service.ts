import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { env } from "@/config/env";
import {
  createForbiddenError,
  createNotFoundError,
  createServiceUnavailableError,
  createTooManyRequestsError,
  createUnauthorizedError,
} from "@/errors";
import { record } from "@/lib/auditLog";
import * as lockout from "@/lib/lockout";
import { logger } from "@/lib/logger";
import { simulatePasswordVerification, verifyPassword } from "@/lib/password";
import {
  type GraceLinkState,
  lookupServeablePair,
  rememberPair,
} from "@/lib/refreshGrace";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import { describeUserAgent } from "@/lib/userAgent";
import * as userService from "@/modules/user/user.service";
import * as userRepository from "../user/user.repository";
import type { CreateCustomerInput } from "../user/user.schema";
import {
  REFRESH_GRACE_WINDOW_MS,
  REFRESH_TOKEN_TTL_MS,
} from "./auth.constants";
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
    // Paga o bcrypt mesmo sem conta: senão o relógio distingue este ramo do de
    // senha errada, e vira oráculo de existência de conta (10.9).
    await simulatePasswordVerification(data.password);
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
      code: "ACCOUNT_BANNED",
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
      code: "PASSWORD_RESET_REQUIRED",
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
      code: "EMAIL_NOT_VERIFIED",
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

/**
 * O estado do elo seguinte, para a janela de graça (10.15). Fica aqui, e não na
 * `lib`, porque a pergunta é ao banco e só o repository fala com o Prisma.
 */
async function classifyGraceLink(
  refreshTokenHash: string,
): Promise<GraceLinkState> {
  const link = await authRepository.findSessionByHash(refreshTokenHash);

  if (!link || link.invalidatedAt || link.expiresAt < new Date()) {
    return "DEAD";
  }

  return link.usedAt ? "ROTATED" : "LIVE";
}

export async function refresh(
  refreshToken: string | undefined,
  context: { userAgent?: string | undefined; ipAddress?: string | undefined },
) {
  if (!refreshToken) {
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  const presentedTokenHash = hashToken(refreshToken);

  const session = await authRepository.findSessionByHash(presentedTokenHash);

  if (!session) {
    throw createUnauthorizedError(REFRESH_INVALID_ERROR);
  }

  if (session.usedAt) {
    // Segunda apresentação do mesmo token. Duas leituras possíveis — cliente
    // concorrente ou cópia roubada — e o `usedAt` decide **qual pergunta
    // fazer**, não qual resposta dar: dentro da janela, quem responde é o
    // cache (10.7); fora dela, é roubo, como sempre foi.
    //
    // A graça só socorre a corrida de rotação de um elo por tudo o mais
    // corriqueiro. Um elo que foi **explicitamente morto** — logout, ban,
    // reset de senha, ou a cascata de um roubo anterior — cai no caminho de
    // sempre: devolver 200 ali reabriria uma sessão que a API acabou de
    // fechar, e por dez segundos depois do fato.
    const graceApplies =
      !session.invalidatedAt &&
      session.expiresAt > new Date() &&
      session.usedAt.getTime() + REFRESH_GRACE_WINDOW_MS > Date.now();

    if (graceApplies) {
      // O par da **ponta viva** da corrente, não o que este elo emitiu. Um par
      // já rotacionado faria o cliente voltar um elo e levar a cascata na
      // renovação seguinte; um par de sessão fechada reabriria por dez segundos
      // o que um logout acabou de encerrar.
      const cached = await lookupServeablePair(
        presentedTokenHash,
        classifyGraceLink,
      );

      if (cached.status === "HIT") {
        log.info(
          {
            userId: session.userId,
            sessionId: session.id,
            chainHops: cached.hops,
          },
          "refresh token replayed inside the grace window, replaying the pair",
        );
        await record({
          action: "AUTH_REFRESH_GRACE_SERVED",
          targetType: "User",
          targetId: session.userId,
          metadata: { sessionId: session.id, chainHops: cached.hops },
        });
        return cached.pair;
      }

      // Corrente sem ponta viva não é falha de infraestrutura, e por isso não
      // é 503: cai no caminho de sempre, logo abaixo, que é o que esta
      // apresentação receberia se a janela nunca tivesse existido.
      if (cached.status === "STALE") {
        log.warn(
          {
            userId: session.userId,
            sessionId: session.id,
            chainHops: cached.hops,
          },
          "refresh replayed inside the grace window with no live link to serve",
        );
      } else {
        // Recusa de decidir, de propósito. Cascatear aqui faria uma falha de
        // infraestrutura deslogar o dono de todos os dispositivos — o dano que a
        // janela existe para evitar —, e rotacionar em modo degradado criaria um
        // caminho que só roda durante incidente, ou seja, que nunca roda.
        // `reason` separa "Redis fora do ar" de "chave sumiu com Redis vivo": a
        // segunda, se recorrente, é evicção por limite de memória.
        log.error(
          {
            userId: session.userId,
            sessionId: session.id,
            reason: cached.status,
          },
          "refresh replayed inside the grace window but the pair is gone",
        );
        throw createServiceUnavailableError({
          message: "Não foi possível renovar a sessão agora",
          action: "Tente novamente em alguns instantes",
        });
      }
    }

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
  const pair = {
    accessToken: generateToken(session.userId),
    refreshToken: newRefreshToken,
  };

  // Antes da rotação de propósito: o par só é servido a quem encontra a linha
  // já marcada como usada, então gravar antes fecha a fresta em que a segunda
  // requisição vê `usedAt` preenchido e o cache ainda vazio. Se a rotação
  // falhar, a chave fica órfã — ninguém a alcança, e a rotação seguinte a
  // sobrescreve. A escrita é best-effort: sua falha não derruba a renovação.
  await rememberPair(presentedTokenHash, pair);

  await authRepository.rotateSession(session.id, {
    userId: session.userId,
    refreshTokenHash: hashToken(newRefreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: context.userAgent,
    ipAddress: context.ipAddress,
  });

  log.info(
    { userId: session.userId, sessionId: session.id },
    "refresh token rotated",
  );

  return pair;
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
