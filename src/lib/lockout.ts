import { env } from "@/config/env";
import { record } from "@/lib/auditLog";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

/**
 * Account lockout (7.10) — janela fixa inicial, dobrando a cada ciclo até um
 * teto, quando a tentativa seguinte à expiração da janela também erra. Estado
 * vive só no Redis (hash `lockout:{userId}`), sem coluna nova no `User` — é
 * efêmero por natureza, e o histórico de tentativas já existe via
 * `AUTH_LOGIN_FAILED` no audit log. Racional completo em
 * `docs/adr/rate-limiting-and-lockout.md`.
 *
 * Fail-open (D2): qualquer falha do Redis é capturada, loga `error` e a
 * conta segue destravada — o lockout nunca impede um login por falha de infra.
 */

const log = logger.child({ module: "lockout" });

export type LockoutState = {
  failures: number;
  backoffLevel: number;
  lockedUntil: number | null;
};

export type LockoutConfig = {
  threshold: number;
  windowMs: number;
  maxMs: number;
};

const EMPTY_STATE: LockoutState = {
  failures: 0,
  backoffLevel: 0,
  lockedUntil: null,
};

export function isLocked(state: LockoutState, now: number): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

type UserWithRoles = { roles: { role: { name: string } }[] };

/**
 * Isenção do lockout (8.8): a senha do usuário demo é pública (README), então
 * o lockout ali não protege credencial nenhuma — só abre um DoS contra a
 * porta de entrada do projeto. Identificado pela role `demo`, não por email,
 * para generalizar a futuras contas de demonstração. Mesmo idioma de `isAdmin`
 * (`src/lib/authorization.ts`).
 */
export function isLockoutExempt(user: UserWithRoles): boolean {
  return user.roles.some((r) => r.role.name === "demo");
}

export type FailureOutcome =
  | { state: LockoutState; triggered: false }
  | {
      state: LockoutState;
      triggered: true;
      failureCount: number;
      backoffLevel: number;
      unlockAt: number;
    };

/**
 * Transição de estado pura para uma tentativa de senha errada.
 *
 * - Já travado (dentro da janela atual): no-op — martelar uma conta já
 *   travada não precisa escalar de novo.
 * - Nunca travou neste ciclo (`backoffLevel === 0`): conta falhas até o
 *   `threshold`; ao atingi-lo, trava pela primeira vez (`windowMs`).
 * - Já travou antes e a janela anterior EXPIROU (é literalmente "a próxima
 *   tentativa depois da janela" do ADR): re-trava imediatamente, sem exigir
 *   `threshold` falhas de novo — dobra o backoff, até `maxMs`.
 */
export function applyFailure(
  state: LockoutState,
  now: number,
  config: LockoutConfig,
): FailureOutcome {
  if (isLocked(state, now)) {
    return { state, triggered: false };
  }

  if (state.backoffLevel === 0) {
    const failures = state.failures + 1;

    if (failures < config.threshold) {
      return { state: { ...state, failures }, triggered: false };
    }

    const lockedUntil = now + config.windowMs;
    return {
      state: { failures: 0, backoffLevel: 1, lockedUntil },
      triggered: true,
      failureCount: config.threshold,
      backoffLevel: 1,
      unlockAt: lockedUntil,
    };
  }

  const backoffLevel = state.backoffLevel + 1;
  const windowMs = Math.min(
    config.windowMs * 2 ** (backoffLevel - 1),
    config.maxMs,
  );
  const lockedUntil = now + windowMs;

  return {
    state: { failures: 0, backoffLevel, lockedUntil },
    triggered: true,
    failureCount: config.threshold,
    backoffLevel,
    unlockAt: lockedUntil,
  };
}

function lockoutKey(userId: string): string {
  return `lockout:${userId}`;
}

async function readState(userId: string): Promise<LockoutState> {
  const raw = await redis.hgetall(lockoutKey(userId));

  if (!raw || Object.keys(raw).length === 0) {
    return EMPTY_STATE;
  }

  return {
    failures: Number(raw.failures ?? 0),
    backoffLevel: Number(raw.backoffLevel ?? 0),
    lockedUntil: raw.lockedUntil ? Number(raw.lockedUntil) : null,
  };
}

async function writeState(userId: string, state: LockoutState): Promise<void> {
  const key = lockoutKey(userId);
  await redis.hset(key, {
    failures: state.failures,
    backoffLevel: state.backoffLevel,
    lockedUntil: state.lockedUntil ?? "",
  });
  // O hash não precisa viver para sempre: TTL = teto do backoff.
  await redis.pexpire(key, env.LOCKOUT_MAX_MS);
}

export async function getLockoutState(
  userId: string,
): Promise<{ isLocked: boolean }> {
  try {
    const state = await readState(userId);
    return { isLocked: isLocked(state, Date.now()) };
  } catch (error) {
    log.error(
      { err: error, userId },
      "lockout store unavailable, failing open",
    );
    return { isLocked: false };
  }
}

export async function recordFailure(userId: string): Promise<void> {
  try {
    const state = await readState(userId);
    const outcome = applyFailure(state, Date.now(), {
      threshold: env.LOCKOUT_THRESHOLD,
      windowMs: env.LOCKOUT_WINDOW_MS,
      maxMs: env.LOCKOUT_MAX_MS,
    });

    await writeState(userId, outcome.state);

    if (outcome.triggered) {
      log.warn(
        { userId, backoffLevel: outcome.backoffLevel },
        "account lockout triggered",
      );
      await record({
        action: "AUTH_LOCKOUT_TRIGGERED",
        targetType: "User",
        targetId: userId,
        metadata: {
          failureCount: outcome.failureCount,
          backoffLevel: outcome.backoffLevel,
          unlockAt: outcome.unlockAt,
        },
      });
    }
  } catch (error) {
    log.error(
      { err: error, userId },
      "lockout store unavailable, failing open",
    );
  }
}

/**
 * Limpa contador e nível de backoff. No-op (retorna `false`) se não havia
 * nada para limpar — usado pelo endpoint de desbloqueio manual para decidir
 * o 409 ("não estava travada").
 */
export async function clearLockout(
  userId: string,
  clearedBy: "ADMIN" | "SUCCESSFUL_LOGIN",
): Promise<boolean> {
  try {
    const state = await readState(userId);

    if (state.failures === 0 && state.backoffLevel === 0) {
      return false;
    }

    await redis.del(lockoutKey(userId));
    await record({
      action: "AUTH_LOCKOUT_CLEARED",
      targetType: "User",
      targetId: userId,
      metadata: { clearedBy },
    });

    return true;
  } catch (error) {
    log.error(
      { err: error, userId },
      "lockout store unavailable, failing open",
    );
    return false;
  }
}
