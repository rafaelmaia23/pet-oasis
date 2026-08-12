import pino from "pino";
import { env } from "@/config/env";
import { logBuffer } from "@/lib/logBuffer";
import { getRequestContext } from "@/lib/requestContext";

/**
 * Campos que nunca saem da aplicação, em nenhuma categoria de log
 * (`docs/reference/logging-policy.md` §5.1). A lista é única e compartilhada: qualquer
 * destino novo (Axiom, Sentry, ring buffer) consome esta mesma configuração —
 * um destino que escapasse do `redact` anularia a política inteira.
 *
 * Fonte única (7.11): `src/lib/sentry.ts` consome estas duas listas planas
 * para censurar o mesmo conjunto de campos no `beforeSend`, em vez de manter
 * uma cópia à mão que poderia divergir desta.
 */
const FORBIDDEN_FIELD_NAMES = [
  "password",
  "currentPassword",
  "newPassword",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
] as const;
const FORBIDDEN_HEADER_NAMES = [
  "authorization",
  "cookie",
  "set-cookie",
] as const;

/**
 * Os caminhos são literais no pino: `x` só cobre o topo e `*.x` só um nível de
 * profundidade, então ambos são declarados para os campos que aparecem tanto
 * soltos quanto dentro de um objeto de contexto.
 */
const REDACTED_PATHS = [
  ...FORBIDDEN_FIELD_NAMES.flatMap((field) => [field, `*.${field}`]),
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
];

/** Decisão pura de ativação do Axiom (7.11, D6): só com as duas vars presentes. */
export function resolveAxiomConfig(
  token: string | undefined,
  dataset: string | undefined,
): { token: string; dataset: string } | undefined {
  if (!token || !dataset) return undefined;
  return { token, dataset };
}

/** Referência ao stream do Axiom, para `flushLogger()` conseguir drená-lo no
 * shutdown — `pino.multistream()` não expõe um `flush()` agregado (verificado
 * em `node_modules/pino`), então a única forma limpa de dar flush num stream
 * específico é guardar a própria referência. */
let axiomStream: pino.DestinationStream | undefined;

/**
 * Destinos por ambiente:
 * - produção: stdout em JSON (o agregador consome) + ring buffer;
 * - desenvolvimento: `pino-pretty` legível + ring buffer;
 * - **teste: só o ring buffer** — a suíte fica silenciosa e os testes afirmam
 *   sobre `logBuffer.list()`, sem mock e usando o mesmo mecanismo que a 7.8
 *   expõe em `GET /logs/recent`.
 *
 * O Axiom (7.11) é **aditivo** em dev e prod, nunca em test — mesmo um
 * `AXIOM_TOKEN` vazado no shell nunca faz a suíte spawnar a worker thread do
 * transport ou bater na rede, porque o branch de test retorna antes.
 */
function buildStreams(): pino.StreamEntry[] {
  const level = env.LOG_LEVEL === "silent" ? "trace" : env.LOG_LEVEL;
  const buffer: pino.StreamEntry = { level, stream: logBuffer };

  if (env.NODE_ENV === "test") return [buffer];

  const base: pino.StreamEntry =
    env.NODE_ENV === "development"
      ? {
          level,
          stream: pino.transport({
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss.l" },
          }) as pino.DestinationStream,
        }
      : { level, stream: pino.destination(1) };

  const streams = [base];

  const axiomConfig = resolveAxiomConfig(env.AXIOM_TOKEN, env.AXIOM_DATASET);
  if (axiomConfig) {
    // Roda em worker thread (comportamento padrão de `pino.transport`) — a
    // chamada remota ao Axiom nunca entra no caminho síncrono do request.
    axiomStream = pino.transport({
      target: "@axiomhq/pino",
      options: axiomConfig,
    }) as pino.DestinationStream;
    streams.push({ level, stream: axiomStream });
  }

  streams.push(buffer);
  return streams;
}

/** Drena um stream com `.flush(cb)` (ex. o `ThreadStream` do `pino.transport`).
 * `undefined` é um no-op — cobre tanto "Axiom nunca configurado" quanto
 * qualquer stream futuro chamado da mesma forma. */
export async function flushStream(
  stream: { flush: (cb: () => void) => void } | undefined,
): Promise<void> {
  if (!stream) return;
  await new Promise<void>((resolve) => {
    stream.flush(() => resolve());
  });
}

/** Chamado pelo `shutdown.ts` antes de sair — sem isto, as últimas linhas
 * antes do SIGTERM se perdem, justamente quando mais importam. */
export function flushLogger(): Promise<void> {
  return flushStream(
    axiomStream as unknown as { flush: (cb: () => void) => void } | undefined,
  );
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

export { FORBIDDEN_FIELD_NAMES, FORBIDDEN_HEADER_NAMES, REDACTED_PATHS };
