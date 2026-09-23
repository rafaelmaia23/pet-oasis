import { z } from "zod";

/**
 * A parte da paginação que atravessa a rede: o que o cliente manda
 * (`?page=&limit=`, `?cursor=&limit=`, `?sort=&order=`) e o `meta` que recebe
 * de volta. O que traduz isso em `skip`/`take`/`orderBy` do Prisma, codifica o
 * cursor e monta o envelope é helper de repository — fica na API.
 *
 * - **Offset** (`?page=&limit=`): listas de CRUD. Ganha `total` e salto para
 *   página arbitrária; aceita o deslize sob escrita concorrente.
 * - **Cursor / keyset** (`?cursor=&limit=`): listas append-only ordenadas por
 *   tempo (audit log). Não tem `total`; nunca pula nem repete registro.
 *
 * A **ordenação configurável** (`?sort=&order=`) existe só no offset: no cursor
 * a chave teria que codificar o próprio campo de ordenação.
 *
 * `limit` default 20 / máximo 100 são **constantes** (fazem parte do contrato
 * documentado no OpenAPI, não da configuração de ambiente).
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

/**
 * Um cursor legítimo é o base64url de `{ c: ISO-8601, i: uuid }` — 100
 * caracteres, sempre. O teto tem folga para não se casar com o formato exato,
 * mas fica bem abaixo do que valeria a pena decodificar e logar.
 */
export const CURSOR_MAX_LENGTH = 128;

export const cursorQuerySchema = z.object({
  cursor: z
    .string()
    .max(
      CURSOR_MAX_LENGTH,
      `cursor deve ter no máximo ${CURSOR_MAX_LENGTH} caracteres`,
    )
    .optional()
    .meta({
      description:
        "Cursor opaco da página seguinte (obtido em meta.nextCursor)",
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
 * `orderBy`, morre em **422** no controller. `order` sem `sort` também é 422
 * (nomeando `order`): o refinamento mora aqui, e não em cada recurso, para ser
 * impossível esquecer dele.
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
