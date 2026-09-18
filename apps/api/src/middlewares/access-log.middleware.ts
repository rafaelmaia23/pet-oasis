import type { IncomingMessage, ServerResponse } from "node:http";
import pinoHttp from "pino-http";
import { logger } from "@/lib/logger";
import { getRequestContext } from "@/lib/requestContext";

/**
 * Rotas de ruído: batem o tempo todo e não dizem nada sobre a saúde do
 * negócio. `/api/v1/status` é o healthcheck do Compose em produção (a cada 5s);
 * as de documentação são estáticas. Em `debug` elas somem sob `LOG_LEVEL=info`
 * sem precisar de filtro no agregador.
 */
const NOISY_ROUTES = [
  "/api/v1/status",
  "/reference",
  "/openapi.json",
  "/scalar/standalone.js",
];

function isNoisy(url: string | undefined): boolean {
  const path = url?.split("?")[0] ?? "";
  return NOISY_ROUTES.includes(path);
}

/**
 * Access log: uma linha por request completada, emitida pelo `pino-http`
 * **usando a instância de `@/lib/logger`** (não uma segunda) — assim herda
 * `redact`, `mixin` e os streams por ambiente.
 *
 * Os serializers são enxutos de propósito: método, rota, status, duração, IP,
 * user-agent. Nada de body, header `Authorization` ou cookie (a política §2 os
 * proíbe; o `redact` é a segunda barreira).
 */
export const accessLog = pinoHttp({
  logger,

  // O id já foi decidido pelo requestContextMiddleware — aqui só se reaproveita,
  // para o access log e o application log do mesmo request baterem.
  genReqId: (req) => getRequestContext()?.requestId ?? String(req.id ?? ""),

  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return "error";
    if (isNoisy(getRequestContext()?.url)) return "debug";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  customSuccessMessage: () => "request completed",
  customErrorMessage: () => "request failed",

  customProps: (_req: IncomingMessage, res: ServerResponse) => {
    const context = getRequestContext();

    return {
      method: context?.method,
      url: context?.url,
      statusCode: res.statusCode,
      ...(context?.ip ? { ip: context.ip } : {}),
      ...(context?.userAgent ? { userAgent: context.userAgent } : {}),
      ...(context?.actorId ? { userId: context.actorId } : {}),
    };
  },

  // O par req/res cru do pino-http traria headers inteiros; os campos úteis já
  // vão em `customProps`.
  serializers: {
    req: () => undefined,
    res: () => undefined,
  },
});
