import pino from "pino";
import { env } from "@/config/env";
import { logBuffer } from "@/lib/logBuffer";
import { getRequestContext } from "@/lib/requestContext";

/**
 * Campos que nunca saem da aplicação, em nenhuma categoria de log
 * (`docs/logging-policy.md` §5.1). A lista é única e compartilhada: qualquer
 * destino novo (Axiom, Sentry, ring buffer) consome esta mesma configuração —
 * um destino que escapasse do `redact` anularia a política inteira.
 *
 * Os caminhos são literais no pino: `x` só cobre o topo e `*.x` só um nível de
 * profundidade, então ambos são declarados para os campos que aparecem tanto
 * soltos quanto dentro de um objeto de contexto.
 */
const REDACTED_PATHS = [
  "password",
  "*.password",
  "currentPassword",
  "*.currentPassword",
  "newPassword",
  "*.newPassword",
  "passwordHash",
  "*.passwordHash",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
];

/**
 * Destinos por ambiente:
 * - produção: stdout em JSON (o agregador consome) + ring buffer;
 * - desenvolvimento: `pino-pretty` legível + ring buffer;
 * - **teste: só o ring buffer** — a suíte fica silenciosa e os testes afirmam
 *   sobre `logBuffer.list()`, sem mock e usando o mesmo mecanismo que a 7.8
 *   expõe em `GET /logs/recent`.
 */
function buildStreams(): pino.StreamEntry[] {
  const buffer: pino.StreamEntry = {
    level: env.LOG_LEVEL === "silent" ? "trace" : env.LOG_LEVEL,
    stream: logBuffer,
  };

  if (env.NODE_ENV === "test") return [buffer];

  if (env.NODE_ENV === "development") {
    return [
      {
        level: env.LOG_LEVEL === "silent" ? "trace" : env.LOG_LEVEL,
        stream: pino.transport({
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l" },
        }) as pino.DestinationStream,
      },
      buffer,
    ];
  }

  return [
    {
      level: env.LOG_LEVEL === "silent" ? "trace" : env.LOG_LEVEL,
      stream: pino.destination(1),
    },
    buffer,
  ];
}

/**
 * Instância raiz do pino. Cada módulo cria a sua com
 * `logger.child({ module: "auth" })` (convenção da política §3).
 *
 * O `mixin` injeta o `requestId` do `AsyncLocalStorage` em **toda** linha, sem
 * ninguém precisar passá-lo adiante — é o que permite recuperar access log,
 * application log e audit log de um mesmo request por um id só.
 */
export const logger = pino(
  {
    level: env.LOG_LEVEL,
    redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
    mixin() {
      const context = getRequestContext();
      return context ? { requestId: context.requestId } : {};
    },
  },
  pino.multistream(buildStreams()),
);

export { REDACTED_PATHS };
