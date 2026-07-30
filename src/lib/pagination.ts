import { z } from "zod";
import { createValidationError } from "@/errors";

/**
 * Helper de paginação com duas estratégias e um envelope só.
 *
 * - **Offset** (`?page=&limit=`): listas de CRUD. Ganha `total` e salto para
 *   página arbitrária; aceita o deslize sob escrita concorrente.
 * - **Cursor / keyset** (`?cursor=&limit=`): listas append-only ordenadas por
 *   tempo (audit log). Chave composta `(createdAt, id)` — o tiebreaker por `id`
 *   é obrigatório, senão registros com o mesmo timestamp são pulados ou
 *   repetidos. Não tem `total`; nunca pula nem repete registro.
 *
 * `limit` default 20 / máximo 100 são **constantes** (fazem parte do contrato
 * documentado no OpenAPI, não da configuração de ambiente). Racional completo em
 * `docs/adr/pagination.md`.
 */

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

const limitField = z.coerce
  .number()
  .int()
  .min(1, "limit deve ser no mínimo 1")
  .max(MAX_LIMIT, `limit deve ser no máximo ${MAX_LIMIT}`)
  .default(DEFAULT_LIMIT)
  .meta({
    description: `Itens por página (1–${MAX_LIMIT})`,
    example: DEFAULT_LIMIT,
  });

export const offsetQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, "page deve ser no mínimo 1")
    .default(1)
    .meta({ description: "Número da página (1-based)", example: 1 }),
  limit: limitField,
});

export const cursorQuerySchema = z.object({
  cursor: z.string().optional().meta({
    description: "Cursor opaco da página seguinte (obtido em meta.nextCursor)",
  }),
  limit: limitField,
});

export type OffsetQuery = z.infer<typeof offsetQuerySchema>;
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

// ── Envelope shapes documentados no OpenAPI ────────────────────────────────

export const offsetMetaSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
  })
  .meta({ id: "OffsetMeta", description: "Metadados de paginação por offset" });

export const cursorMetaSchema = z
  .object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .meta({ id: "CursorMeta", description: "Metadados de paginação por cursor" });

export type OffsetMeta = z.infer<typeof offsetMetaSchema>;
export type CursorMeta = z.infer<typeof cursorMetaSchema>;

// ── Offset ─────────────────────────────────────────────────────────────────

export function buildOffsetArgs(query: OffsetQuery): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

export function offsetEnvelope<T>(
  data: T[],
  query: OffsetQuery,
  total: number,
): { data: T[]; meta: OffsetMeta } {
  return { data, meta: { page: query.page, limit: query.limit, total } };
}

// ── Cursor / keyset ──────────────────────────────────────────────────────────

export type Cursor = { createdAt: Date; id: string };

/** Item ordenável por `(createdAt, id)` — o shape mínimo que o cursor precisa. */
export type CursorRow = { createdAt: Date; id: string };

export function encodeCursor(cursor: Cursor): string {
  const payload = JSON.stringify({
    c: cursor.createdAt.toISOString(),
    i: cursor.id,
  });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  const invalid = () =>
    createValidationError({
      message: "Cursor inválido",
      errors: { cursor: ["Cursor malformado ou corrompido"] },
      action: "Omita o cursor para começar da primeira página",
    });

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }

  if (typeof parsed !== "object" || parsed === null) throw invalid();
  const { c, i } = parsed as Record<string, unknown>;
  if (typeof c !== "string" || typeof i !== "string") throw invalid();

  const createdAt = new Date(c);
  if (Number.isNaN(createdAt.getTime())) throw invalid();

  return { createdAt, id: i };
}

/**
 * Constrói o filtro keyset "registros estritamente depois do cursor" para a
 * ordenação `createdAt DESC, id DESC`. O segundo ramo do `OR` é o tiebreaker por
 * `id` — sem ele, registros com `createdAt` idêntico ao do cursor são pulados.
 * Retorna `undefined` quando não há cursor (primeira página).
 */
export function buildCursorFilter(cursor: string | undefined) {
  if (!cursor) return undefined;
  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

/**
 * Recebe as linhas **cruas** buscadas com `take: limit + 1` e devolve a página
 * cortada mais o `meta` de cursor. O `nextCursor` aponta para a última linha
 * DESTA página (não para a linha extra), calculado a partir do par cru
 * `(createdAt, id)` antes de qualquer serialização.
 */
export function cursorEnvelope<T extends CursorRow>(
  rows: T[],
  limit: number,
): { data: T[]; meta: CursorMeta } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt, id: last.id })
      : null;
  return { data, meta: { nextCursor, hasMore } };
}

// ── Listas sem paginação ─────────────────────────────────────────────────────

/**
 * Envelope uniforme para listagens que não paginam. `meta` fica vazio de
 * propósito — ganhar paginação amanhã vira aditivo em vez de breaking (D4).
 */
export function listEnvelope<T>(data: T[]): {
  data: T[];
  meta: Record<string, never>;
} {
  return { data, meta: {} };
}
