import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * O **único** arquivo do projeto com SQL cru (9.9/Z11). O nome diz isso de
 * propósito: a regra "SQL cru vive exclusivamente no repository" só é auditável
 * se o lugar onde ele mora for óbvio.
 *
 * Duas responsabilidades, nesta ordem:
 *
 * 1. **Corrigir** o que foi digitado, palavra a palavra, contra o dicionário de
 *    lexemas (Z5). É aqui que "golen" vira "golden" — e não no ranking.
 * 2. **Ranquear** os produtos que casam com a query já corrigida (Z12).
 *
 * O que este arquivo **não** faz é decidir o que é visível (Z4): ele devolve
 * `(id, rank)` e nada mais. Quem recorta continua sendo o `buildProductWhere` do
 * `product.repository.ts`, aplicado depois pelo Prisma sobre estes ids. Uma
 * query crua completa daria `total` exato e uma ida ao banco a menos, ao custo
 * de uma segunda definição de "produto visível" — que é o vazamento que a Y8
 * fechou na 9.8, reaberto por outra porta.
 */

/**
 * Teto de ids ranqueados (Z9). O `total` de uma busca é, portanto, "quantos
 * casaram, até 500" — imprecisão barata numa busca, ao contrário de um rascunho
 * vazando.
 */
export const SEARCH_ID_CAP = 500;

/**
 * Limiar de similaridade (Z13). `0.3` (o default do `pg_trgm`) aceita
 * `gato`/`galo`; `0.5` já recusa `golen`→`golden`.
 */
const SIMILARITY_THRESHOLD = 0.4;

/**
 * Abaixo de 3 caracteres o trigrama não distingue nada, então a palavra passa
 * intacta em vez de virar uma correção arbitrária (Z13).
 */
const MIN_CORRECTABLE_LENGTH = 3;

/** Peso da marca em relação ao produto (Z12): sinal secundário, mas que soma. */
const BRAND_RANK_WEIGHT = 0.4;

/**
 * Armadilha 6 do ADR: `pg_trgm.similarity_threshold` é GUC de **sessão**, e com
 * pool de conexões uma sessão é emprestada a qualquer requisição. `SET LOCAL`
 * morre no fim da transação, que é o único escopo confiável aqui.
 *
 * `$executeRawUnsafe` porque `SET` não aceita parâmetro de bind — o valor
 * interpolado é a constante acima, nunca entrada de usuário.
 */
const setThreshold = (tx: Prisma.TransactionClient) =>
  tx.$executeRawUnsafe(
    `SET LOCAL pg_trgm.similarity_threshold = ${SIMILARITY_THRESHOLD}`,
  );

type CorrectionRow = { ord: number; suggestion: string | null };

/**
 * Devolve, para cada palavra digitada, a palavra que de fato vai para a busca.
 *
 * Uma palavra só é trocada quando **não existe** no catálogo — nem na forma
 * escrita, nem pelo radical. Sem essa checagem, `cama` viraria `cana` e a busca
 * pioraria justamente para quem digitou certo.
 *
 * Palavra que não existe e não tem vizinha acima do limiar vai **como está**
 * (Z13): a busca devolve vazio, que é honesto, em vez de descartar em silêncio
 * metade do que a pessoa pediu.
 */
export async function correctWords(words: string[]): Promise<string[]> {
  if (words.length === 0) return [];

  const rows = await prisma.$transaction(async (tx) => {
    await setThreshold(tx);

    return tx.$queryRaw<CorrectionRow[]>`
      WITH input AS (
        SELECT ord::int AS ord, lower(f_unaccent(w)) AS word
          FROM unnest(${words}::text[]) WITH ORDINALITY AS t(w, ord)
      )
      SELECT
        i.ord,
        CASE
          WHEN length(i.word) < ${MIN_CORRECTABLE_LENGTH} THEN NULL
          WHEN EXISTS (
            SELECT 1
              FROM search_lexemes s
             WHERE s.word = i.word
                OR (
                  s.lexeme IS NOT NULL
                  AND s.lexeme = (
                    SELECT l.lexeme
                      FROM unnest(to_tsvector('portuguese', i.word)) AS l
                     LIMIT 1
                  )
                )
          ) THEN NULL
          ELSE (
            SELECT s.word
              FROM search_lexemes s
             WHERE s.word % i.word
             ORDER BY similarity(s.word, i.word) DESC, s.occurrences DESC, s.word ASC
             LIMIT 1
          )
        END AS suggestion
        FROM input i
       ORDER BY i.ord
    `;
  });

  const suggestionByOrd = new Map(
    rows.map((row) => [row.ord, row.suggestion] as const),
  );

  return words.map((word, index) => suggestionByOrd.get(index + 1) ?? word);
}

type RankedRow = { id: string };

/**
 * Os ids que casam com a busca, do mais relevante para o menos.
 *
 * A query já chega corrigida, e as palavras corrigidas são **palavras**, não
 * lexemas — por isso `plainto_tsquery` com a mesma configuração e o mesmo
 * `f_unaccent` das colunas geradas. Corrigir contra lexemas obrigaria a montar
 * a `tsquery` na mão para não radicalizar duas vezes.
 *
 * O desempate por `id` não é enfeite: sem ele, dois produtos com o mesmo rank
 * se repetem ou somem na borda da página — a mesma lição da Y3.
 */
export async function findRankedProductIds(query: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<RankedRow[]>`
    SELECT p.id
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      CROSS JOIN plainto_tsquery('portuguese', f_unaccent(${query})) AS q(query)
     WHERE p.search_vector @@ q.query
        OR b.search_vector @@ q.query
     ORDER BY
       ts_rank(p.search_vector, q.query)
         + ${BRAND_RANK_WEIGHT} * ts_rank(b.search_vector, q.query) DESC,
       p.id ASC
     LIMIT ${SEARCH_ID_CAP}
  `;

  return rows.map((row) => row.id);
}

/**
 * Curto-circuito de SKU (Z2): código impresso na caixa, digitado inteiro na
 * caixa de busca. Casamento **exato**, sem acentuar o ranking de ninguém — pôr
 * o SKU no `tsvector` faria o tokenizador quebrar `GOLDEN-AD-15KG` em pedaços e
 * virar ruído para todas as outras buscas.
 */
export async function findProductIdBySku(sku: string): Promise<string | null> {
  const variant = await prisma.productVariant.findFirst({
    where: { deletedAt: null, sku: { equals: sku, mode: "insensitive" } },
    select: { productId: true },
  });

  return variant?.productId ?? null;
}

/**
 * O dicionário é uma view materializada (Z14) — não se atualiza sozinha. Quem
 * chama é o seed, o `demo-reset` e o script, nunca o caminho de request.
 *
 * `CONCURRENTLY` não é enfeite: sem ele o `REFRESH` pega ACCESS EXCLUSIVE e
 * **bloqueia toda busca em curso** enquanto roda — um `demo-reset` numa
 * instância viva derrubaria os `?q=` em timeout. É para isto que a migration
 * cria o índice unique sobre `word`, que é o requisito da forma concorrente.
 * Fora de transação, de propósito: `CONCURRENTLY` não roda dentro de uma.
 */
export async function refreshSearchLexemes(): Promise<void> {
  await prisma.$executeRawUnsafe(
    "REFRESH MATERIALIZED VIEW CONCURRENTLY search_lexemes",
  );
}
