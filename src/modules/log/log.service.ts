import { env } from "@/config/env";
import { logBuffer } from "@/lib/logBuffer";
import type { ListRecentLogsQuery } from "./log.schema";

/**
 * Lê o ring buffer de logs em memória (7.3), mais recentes primeiro. As entradas
 * já chegam ao buffer redigidas pelo `redact` do pino, então saem como estão —
 * um presenter de whitelist derrubaria os campos heterogêneos de cada linha.
 *
 * O `meta` declara as limitações do buffer (docs/reference/logging-policy.md §9): é **por
 * processo** (com réplicas, cada request vê só a fatia da instância que atendeu)
 * e **volátil** (some no restart).
 */
export function listRecentLogs(query: ListRecentLogsQuery) {
  const newestFirst = logBuffer.list().reverse();
  const data = query.limit ? newestFirst.slice(0, query.limit) : newestFirst;

  return {
    data,
    meta: {
      count: data.length,
      capacity: env.LOG_BUFFER_SIZE,
      perProcess: true,
      volatile: true,
    },
  };
}
