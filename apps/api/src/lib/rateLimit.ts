import type { NextFunction, Request, Response } from "express";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { env } from "@/config/env";
import { createTooManyRequestsError, retryAfterHeader } from "@/errors";
import { record } from "@/lib/auditLog";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

/**
 * Rate limiting por IP e por email-alvo (7.9), Redis via `rate-limiter-flexible`.
 * Fail-open (D2): se o Redis falhar, `consume()` rejeita com um erro que NÃO é
 * `RateLimiterRes` — o limitador é ignorado e o request segue, emitindo `error`
 * no application log. Racional completo em `docs/adr/0003-rate-limiting-and-lockout.md`.
 */

const log = logger.child({ module: "rateLimit" });

export type RateLimitRule =
  | "login"
  | "signup"
  | "forgot-password"
  | "verify-email-resend"
  // 8.7: os dois pontos que disparam email sem o ator provar posse da conta.
  // Compartilham o balde de email-alvo com as duas rotas acima (K27) — o
  // orçamento é do email, não do ator; a `rule` só distingue a origem no audit.
  | "signup-reactivation"
  | "account-reactivation"
  // 8.7/K26: as três rotas públicas que consomem token opaco, num balde por IP
  // só (mesmo idioma do `emailIpLimiter`, compartilhado por duas rules).
  | "reset-password"
  | "confirm-email-change"
  | "confirm-account-reactivation"
  // 9.6: leitura pública do catálogo. Uma `rule` só para as quatro rotas (e
  // para `/products` na 9.8) — o orçamento é da vitrine inteira, não de cada
  // lista; separar faria um scraper ganhar N baldes pelo preço de um.
  | "catalog-read"
  // 9.10: upload de imagem. Uma `rule` só para produto, pet e marca — o
  // orçamento é do gesto "subir arquivo", não de cada dono.
  | "image-upload";

type Limiter = Pick<RateLimiterRedis, "consume">;

export const loginIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:login:ip",
  points: env.RATE_LIMIT_LOGIN_MAX,
  duration: env.RATE_LIMIT_LOGIN_WINDOW_MS / 1000,
});

export const signupIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:signup:ip",
  points: env.RATE_LIMIT_SIGNUP_MAX,
  duration: env.RATE_LIMIT_SIGNUP_WINDOW_MS / 1000,
});

// Compartilhado entre forgot-password e verify-email/resend (mesma linha na
// tabela do ADR: um contador só por IP para as duas rotas).
export const emailIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:email:ip",
  points: env.RATE_LIMIT_EMAIL_MAX,
  duration: env.RATE_LIMIT_EMAIL_WINDOW_MS / 1000,
});

export const emailTargetLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:email:target",
  points: env.RATE_LIMIT_EMAIL_TARGET_MAX,
  duration: env.RATE_LIMIT_EMAIL_TARGET_WINDOW_MS / 1000,
});

// Compartilhado pelas três rotas públicas que consomem token opaco (K26):
// balde próprio, não o `emailIpLimiter` — enviar email e consumir token são
// superfícies diferentes, e dividir faria um reset legítimo comer o orçamento
// do outro.
export const tokenIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:token:ip",
  points: env.RATE_LIMIT_TOKEN_MAX,
  duration: env.RATE_LIMIT_TOKEN_WINDOW_MS / 1000,
});

// Leitura pública do catálogo (9.6). Balde próprio e por IP porque aqui não há
// identidade nenhuma: é a primeira superfície do projeto que responde em volume
// a quem não tem conta. Cobre também `GET /breeds`, que subiu na 9.3 sem
// limiter — risco baixo e assumido na época, fechado aqui.
export const catalogIpLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:catalog:ip",
  points: env.RATE_LIMIT_CATALOG_MAX,
  duration: env.RATE_LIMIT_CATALOG_WINDOW_MS / 1000,
});

// Upload de imagem (9.10/AA18). Balde por **usuário**, não por IP: por IP ele
// atropelaria o mutirão de cadastro inicial (vários funcionários, um NAT só),
// e o que ele barra — script bugado, conta comprometida — é propriedade de uma
// conta. O limite estrutural mais forte continua sendo o teto de imagens por
// produto, que é regra de domínio e não orçamento de janela.
export const uploadUserLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rl:upload:user",
  points: env.RATE_LIMIT_UPLOAD_MAX,
  duration: env.RATE_LIMIT_UPLOAD_WINDOW_MS / 1000,
});

async function enforce(
  limiter: Limiter,
  key: string,
  rule: RateLimitRule,
  scope: "IP" | "EMAIL" | "USER",
): Promise<void> {
  try {
    await limiter.consume(key);
  } catch (rejection) {
    if (rejection instanceof RateLimiterRes) {
      log.warn({ rule, scope }, "rate limit exceeded");
      await record({
        action: "AUTH_RATE_LIMIT_EXCEEDED",
        targetType: "Route",
        metadata: { rule, scope },
      });
      // O header vai no próprio erro, não em `res.set`: `enforce` roda tanto em
      // middleware (com `res` à mão) quanto direto de dentro de um service
      // (sem `res`, 8.7). O error handler central aplica nos dois casos.
      throw createTooManyRequestsError({
        headers: retryAfterHeader(rejection.msBeforeNext),
      });
    }

    log.error(
      { err: rejection, rule, scope },
      "rate limiter unavailable, failing open",
    );
  }
}

export function rateLimitByIp(limiter: Limiter, rule: RateLimitRule) {
  return async function rateLimitByIpMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await enforce(limiter, req.ip ?? "unknown", rule, "IP");
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Balde por ator autenticado (9.10). Sem `req.user` ele **não consome e segue**:
 * quem recusa quem não tem identidade é o `canAccess`, que roda antes na rota.
 * Consumir aqui daria a um anônimo o poder de gastar cota de um balde que ele
 * nem tem — e não haveria chave sensata para contá-lo.
 */
export function rateLimitByUser(limiter: Limiter, rule: RateLimitRule) {
  return async function rateLimitByUserMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const user = req.user;

    if (!user) {
      next();
      return;
    }

    try {
      await enforce(limiter, user.id, rule, "USER");
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function rateLimitByEmailTarget(limiter: Limiter, rule: RateLimitRule) {
  return async function rateLimitByEmailTargetMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const email = (req.body as Record<string, unknown> | undefined)?.email;

    if (typeof email !== "string" || email.length === 0) {
      next();
      return;
    }

    try {
      await enforce(limiter, email.toLowerCase(), rule, "EMAIL");
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Consumo do limitador por email-alvo **sem middleware**, para call sites
 * dentro de um service — onde o email só é conhecido depois de guards que já
 * rodaram e não há `Request`/`Response` à mão (8.7: o ramo de reativação do
 * signup e `POST /users/:id/reactivate`). O limiter vem por parâmetro, mesmo
 * padrão de DI dos dois middlewares, o que permite testar sem tocar o Redis.
 */
export async function consumeEmailTargetLimit(
  limiter: Limiter,
  email: string,
  rule: RateLimitRule,
): Promise<void> {
  await enforce(limiter, email.toLowerCase(), rule, "EMAIL");
}
