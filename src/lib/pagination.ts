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
 * A **ordenação configurável** (`?sort=&order=`, Fase 9.2) existe só no offset:
 * no cursor a chave teria que codificar o próprio campo de ordenação, e a
 * limitação segue registrada no `docs/reference/backlog.md`.
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

// ── Ordenação configurável (só no offset) ────────────────────────────────────

export type SortOrder = "asc" | "desc";

/**
 * Allowlist de ordenação do recurso: campo público → **direção natural**, usada
 * quando o cliente manda `?sort=` sem `?order=`. Data desce (mais recente
 * primeiro), texto sobe (A→Z) — assim `?sort=createdAt` não inverte a lista em
 * relação a não mandar parâmetro nenhum.
 */
export type SortableFields = Readonly<Record<string, SortOrder>>;

export type SortConfig<F extends SortableFields = SortableFields> = {
  readonly fields: F;
  /** Campo usado quando `sort` é omitido; a direção natural dele é a default. */
  readonly default: keyof F & string;
};

/** Declara a allowlist de um recurso preservando os literais dos campos. */
export function defineSortConfig<const F extends SortableFields>(
  config: SortConfig<F>,
): SortConfig<F> {
  return config;
}

export type SortQuery<F extends SortableFields> = {
  sort?: (keyof F & string) | undefined;
  order?: SortOrder | undefined;
};

/**
 * Monta a query completa de uma listagem por offset: `page`/`limit`, a
 * ordenação configurável do recurso e os filtros próprios dele.
 *
 * O `sort` é um `z.enum` da allowlist — campo fora dela nunca chega ao
 * `orderBy` do Prisma, morre em **422** no controller. `order` sem `sort` também
 * é 422 (nomeando `order`): o refinamento mora aqui, e não em cada recurso, para
 * ser impossível esquecer dele.
 */
export function buildOffsetQuerySchema<
  F extends SortableFields,
  S extends z.ZodRawShape = Record<string, never>,
>(config: SortConfig<F>, filters?: S) {
  // `Object.keys` perde os literais; a allowlist é fechada em compile-time pelo
  // tipo de `config.fields`, então o cast só devolve o que já se sabe.
  const sortableNames = Object.keys(config.fields) as [
    keyof F & string,
    ...(keyof F & string)[],
  ];

  // O refinamento é aplicado no par `sort`/`order` sozinho e sobrevive aos
  // `.extend()` seguintes (no Zod 4 os checks vivem dentro do schema); refinar
  // no fim, sobre o objeto já genérico, impediria a inferência do callback.
  return z
    .object({
      sort: z
        .enum(sortableNames)
        .optional()
        .meta({
          description: `Campo de ordenação (default: ${config.default})`,
          example: config.default,
        }),
      order: z
        .enum(["asc", "desc"] as const)
        .optional()
        .meta({
          description:
            "Direção da ordenação (default: a direção natural do campo); exige sort",
          example: "asc",
        }),
    })
    .refine((query) => query.order === undefined || query.sort !== undefined, {
      path: ["order"],
      error: "order exige sort",
    })
    .extend({
      ...offsetQuerySchema.shape,
      ...((filters ?? {}) as S),
    });
}

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
