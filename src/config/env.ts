import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  DATABASE_URL: z.url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),

  PEPPER: z.string().min(32),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Pet Oasis <no-reply@petoasis.dev>"),
  APP_URL: z.url().default("http://localhost:5173"),

  SEED_DEMO_USER: z.stringbool().default(false),
  DEMO_EMAIL: z.email().default("demo@petoasis.dev"),
  DEMO_PASSWORD: z.string().default("DemoOasis2026!"),

  // Forma HOST (localhost) — o container recebe `redis://redis:6379` pelo
  // override do Compose, mesmo idioma da DATABASE_URL.
  REDIS_URL: z.url().default("redis://localhost:6379"),

  // `info` é o default de produção; dev sobe para `debug` pelo .env.development.
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  LOG_BUFFER_SIZE: z.coerce.number().int().positive().default(500),

  // Origens extras (staging/preview) além do APP_URL, separadas por vírgula.
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // Teto do corpo JSON aceito pelo body-parser (sintaxe do pacote `bytes`).
  JSON_BODY_LIMIT: z.string().default("100kb"),

  // Rate limiting (7.9) — janela deslizante por IP e por email-alvo, contada
  // no Redis via `rate-limiter-flexible`. Duas vars por regra (MAX + WINDOW_MS)
  // em vez de uma string composta: mesmo idioma do LOCKOUT_* abaixo, sem
  // parser novo no projeto.
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_LOGIN_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_SIGNUP_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_SIGNUP_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  // Compartilhado entre forgot-password e verify-email/resend (mesma linha no
  // ADR de rate limiting: um contador só por IP para as duas rotas).
  RATE_LIMIT_EMAIL_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_EMAIL_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  RATE_LIMIT_EMAIL_TARGET_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_EMAIL_TARGET_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "Invalid environment variables:",
    z.treeifyError(parsedEnv.error),
  );
  process.exit(1);
}

export const env = parsedEnv.data;
