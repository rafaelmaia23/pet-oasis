import type { CorsOptions } from "cors";
import { env } from "@/config/env";

/**
 * Allowlist de origens: o front (`APP_URL`) sempre entra; `CORS_ALLOWED_ORIGINS`
 * (CSV) adiciona as extras (staging, preview) sem exigir mudança de código.
 */
const allowedOrigins = new Set(
  [env.APP_URL, ...(env.CORS_ALLOWED_ORIGINS?.split(",") ?? [])]
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

/**
 * `credentials: true` porque o refresh token viaja em cookie httpOnly.
 *
 * Origem fora da lista → callback sem erro e sem origem liberada: a resposta
 * sai **sem** os headers de CORS e quem bloqueia é o navegador. Devolver erro
 * aqui viraria um 500 no error handler para um caso que não é falha do servidor.
 * Request sem `Origin` (curl, Bruno, a suíte) passa direto — CORS é uma regra
 * de navegador, não de autorização.
 */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
};
