import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ErrorEvent } from "@sentry/node";
import * as Sentry from "@sentry/node";
import { env } from "@/config/env";
import { FORBIDDEN_FIELD_NAMES, FORBIDDEN_HEADER_NAMES } from "@/lib/logger";

const CENSOR = "[REDACTED]";

// Headers chegam em minúsculas por convenção HTTP; os nomes de campo do pino
// (`password`, `accessToken`, ...) são camelCase — normaliza os dois pra
// comparar por `toLowerCase()` sem perder nenhum dos dois formatos.
const FORBIDDEN_KEYS = new Set(
  [...FORBIDDEN_FIELD_NAMES, ...FORBIDDEN_HEADER_NAMES].map((name) =>
    name.toLowerCase(),
  ),
);

/**
 * Percorre um evento do Sentry e censura os mesmos campos/headers proibidos
 * de `docs/logging-policy.md` §5.1 — reaproveitando as listas do pino
 * (`logger.ts`) em vez de manter uma cópia à mão que pudesse divergir.
 *
 * Função pura, sem depender do SDK: testável com um objeto-fixture, sem
 * mockar `@sentry/node`.
 */
export function scrubEvent<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => scrubEvent(item)) as T;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[key] = FORBIDDEN_KEYS.has(key.toLowerCase())
        ? CENSOR
        : scrubEvent(entry);
    }
    return result as T;
  }

  return value;
}

function beforeSend(event: ErrorEvent): ErrorEvent {
  return scrubEvent(event);
}

/**
 * Lido do `package.json` (copiado para o runtime pelo Dockerfile) em vez de
 * hardcoded — sem pipeline de CI/CD publicando git SHA ainda nesta fase.
 *
 * `process.cwd()`, não caminho relativo ao módulo: o tsup achata
 * `src/lib/sentry.ts` num `dist/server.js` só, então "dois níveis acima do
 * arquivo" aponta pra profundidades diferentes em dev (tsx, arquivo fonte
 * fundo) e produção (bundle raso) — `process.cwd()` é `/app` nos três
 * ambientes (dev/test rodam da raiz do repo, o runtime tem `WORKDIR /app`
 * com o `package.json` copiado ali), então é o único ponto estável.
 */
function readPackageVersion(): string {
  const raw = readFileSync(join(process.cwd(), "package.json"), "utf-8");
  const { version } = JSON.parse(raw) as { version: string };
  return version;
}

// D6: só ativa com SENTRY_DSN presente; ausente, `Sentry.captureException`
// em qualquer outro módulo vira um no-op seguro do próprio SDK — a app nunca
// para de bootar por causa disto.
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: `pet-oasis@${readPackageVersion()}`,
    sendDefaultPii: false,
    beforeSend,
  });
}

export { Sentry };
