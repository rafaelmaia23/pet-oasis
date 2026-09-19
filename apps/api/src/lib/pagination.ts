import type {
  CursorMeta,
  OffsetMeta,
  OffsetQuery,
  SortableFields,
  SortConfig,
  SortOrder,
  SortQuery,
} from "@pet-oasis/api-contracts/pagination";
import { createValidationError } from "@/errors";

/**
 * Helpers de paginação do lado do repository. O que atravessa a rede — os
 * schemas de query (`?page=&limit=`, `?cursor=&limit=`, `?sort=&order=`), as
 * allowlists de ordenação e o shape do `meta` — vive no contrato
 * (`@pet-oasis/api-contracts/pagination`); aqui fica o que traduz isso em
 * `skip`/`take`/`orderBy` do Prisma, codifica o cursor e monta o envelope.
 *
 * - **Offset** (`?page=&limit=`): listas de CRUD. Ganha `total` e salto para
 *   página arbitrária; aceita o deslize sob escrita concorrente.
 * - **Cursor / keyset** (`?cursor=&limit=`): listas append-only ordenadas por
 *   tempo (audit log). Chave composta `(createdAt, id)` — o tiebreaker por `id`
 *   é obrigatório, senão registros com o mesmo timestamp são pulados ou
 *   repetidos. Não tem `total`; nunca pula nem repete registro.
 *
 * A **ordenação configurável** (`?sort=&order=`, Fase 9.2) existe só no offset:
 * no cursor a chave teria que codificar o próprio campo de ordenação, e a
 * limitação segue registrada no `docs/reference/backlog.md`. Racional completo
 * em `docs/adr/pagination.md`.
 */

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

// ── Ordenação configurável (só no offset) ────────────────────────────────────

/**
 * Traduz `{ sort, order }` já validados no `orderBy` do Prisma, sempre com o
 * **tiebreaker por `id`** na mesma direção — sem ele, dois registros com o mesmo
 * valor no campo de ordenação se repetem ou somem na borda da página (a lição da
 * 7.7, que valia só para o cursor e agora vale para o offset também).
 */
export function buildOrderBy<F extends SortableFields>(
  query: SortQuery<F>,
  config: SortConfig<F>,
): ({ [K in keyof F]?: SortOrder } & { id?: SortOrder })[] {
  const field = query.sort ?? config.default;
  const order = query.order ?? config.fields[field] ?? "asc";

  return [
    // Chave dinâmica: o campo é da allowlist, mas o TS não estreita um índice
    // computado para o shape mapeado.
    { [field]: order } as { [K in keyof F]?: SortOrder },
    { id: order },
  ];
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
