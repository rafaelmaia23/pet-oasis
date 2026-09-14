import type { CorsOptions } from "cors";
import { env } from "@/config/env";

/**
 * Allowlist de origens, **só** de `CORS_ALLOWED_ORIGINS` (CSV). A `APP_URL` não
 * entra por inércia: ela é o front, e o front fala com a API pelo servidor
 * (BFF), nunca pelo navegador — uma entrada para ela seria permissão concedida
 * a um consumidor que não existe. App mobile nativo tampouco é motivo para
 * entrar aqui: não há navegador, não há `Origin`, não há preflight. Em
 * produção hoje a lista é vazia; ela existe para o dia em que houver um cliente
 * de navegador de outra origem.
 */
export const parseAllowedOrigins = (csv: string | undefined): Set<string> =>
  new Set(
    (csv?.split(",") ?? [])
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );

const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

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
