import { env } from "@/config/env";

/**
 * Teto por entrada. Uma linha gigante (stack enorme, payload acidental) não
 * pode comer a memória reservada para as outras `LOG_BUFFER_SIZE`.
 */
export const MAX_ENTRY_SIZE = 8_000;

export type LogEntry = Record<string, unknown>;

/**
 * Ring buffer em memória com as últimas `LOG_BUFFER_SIZE` linhas de log.
 *
 * Serve a `GET /logs/recent` (7.8): é a única leitura de log disponível de
 * dentro da própria API, sem conta de terceiro. Limitações declaradas na
 * política §9 e na resposta do endpoint: é **por processo** e **some no
 * restart** — não substitui o destino externo (Axiom, 7.9).
 *
 * Plugado no pino como stream (`write` recebe cada linha NDJSON e guarda o
 * objeto já parseado, para o endpoint devolver JSON e não string).
 */
class LogBuffer {
  private readonly entries: (LogEntry | undefined)[];
  private nextIndex = 0;
  private count = 0;

  constructor(private readonly capacity: number) {
    this.entries = new Array(capacity);
  }

  push(entry: LogEntry): void {
    this.entries[this.nextIndex] = truncate(entry);
    this.nextIndex = (this.nextIndex + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /** Da mais antiga para a mais recente. */
  list(): LogEntry[] {
    const start =
      this.count < this.capacity
        ? 0
        : (this.nextIndex + this.capacity) % this.capacity;

    const result: LogEntry[] = [];
    for (let i = 0; i < this.count; i++) {
      const entry = this.entries[(start + i) % this.capacity];
      if (entry) result.push(entry);
    }
    return result;
  }

  clear(): void {
    this.entries.fill(undefined);
    this.nextIndex = 0;
    this.count = 0;
  }

  /**
   * Interface de stream do pino. Linha inválida é descartada em silêncio: o
   * subsistema de log jamais pode derrubar quem está logando.
   */
  write(chunk: string): void {
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;

      try {
        this.push(JSON.parse(line) as LogEntry);
      } catch {
        // linha malformada — ignorada de propósito
      }
    }
  }
}

function truncate(entry: LogEntry): LogEntry {
  const serialized = JSON.stringify(entry);

  if (serialized.length <= MAX_ENTRY_SIZE) return entry;

  return {
    level: entry.level,
    time: entry.time,
    requestId: entry.requestId,
    msg: typeof entry.msg === "string" ? entry.msg.slice(0, 200) : undefined,
    truncated: true,
    originalSize: serialized.length,
  };
}

export const logBuffer = new LogBuffer(env.LOG_BUFFER_SIZE);
