-- Busca textual do catálogo (Fase 9.9). Migration escrita à mão: extensões,
-- função, colunas geradas e view materializada são DDL que o Prisma não gera.
-- Racional completo em `docs/adr/text-search.md`.

-- ── Extensões ────────────────────────────────────────────────────────────────
-- Armadilha 2 do ADR: o Prisma não declara extensão, e dev/test/prod precisam
-- das duas. Como isto roda por `migrate deploy`, os três ambientes ganham juntos.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── f_unaccent (Z8) ──────────────────────────────────────────────────────────
-- Coluna gerada exige função IMMUTABLE, e `unaccent()` é STABLE. Marcar este
-- wrapper como IMMUTABLE é uma mentira consciente: segura porque o dicionário
-- `unaccent` não muda em produção, e perigosa se alguém editar `unaccent.rules`
-- — as colunas geradas não seriam reconstruídas.
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

-- ── Colunas geradas (Z1, Z12) ────────────────────────────────────────────────
-- Nome com peso A, descrição com peso C: bem afastados de propósito (o `ts_rank`
-- padrão dá 1.0 para A e 0.2 para C), para uma palavra no nome sempre ganhar da
-- mesma palavra enterrada em 2000 caracteres de descrição.
ALTER TABLE "products"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', f_unaccent(coalesce("name", ''))), 'A') ||
    setweight(to_tsvector('portuguese', f_unaccent(coalesce("description", ''))), 'C')
  ) STORED;

-- A marca tem vetor próprio porque coluna gerada não cruza linha. É o que a põe
-- no corpus sem denormalização mantida por trigger.
ALTER TABLE "brands"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', f_unaccent(coalesce("name", ''))), 'A')
  ) STORED;

-- Armadilha 3 do ADR: sem GIN a busca funciona e é lenta — e a lentidão só
-- aparece com volume, isto é, depois do deploy.
CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("search_vector");
CREATE INDEX "brands_search_vector_idx" ON "brands" USING GIN ("search_vector");

-- ── Dicionário de lexemas (Z5, Z14, Z17) ─────────────────────────────────────
-- As palavras que existem no catálogo, com o lexema de cada uma. É contra esta
-- lista que o erro de digitação é corrigido, palavra a palavra, ANTES de a busca
-- virar `tsquery` — por isso o ranking segue `ts_rank` puro.
--
-- Z17: só conteúdo **publicamente visível**. Com o catálogo inteiro aqui, a
-- correção devolvida em `meta.search.applied` deixaria um anônimo sondar
-- rascunho palavra a palavra, mesmo com a lista de resultados vazia.
CREATE MATERIALIZED VIEW "search_lexemes" AS
WITH source AS (
  SELECT p."name" AS content
    FROM "products" p
   WHERE p."deleted_at" IS NULL AND p."status" = 'ACTIVE'
  UNION ALL
  SELECT p."description"
    FROM "products" p
   WHERE p."deleted_at" IS NULL AND p."status" = 'ACTIVE'
  UNION ALL
  SELECT b."name"
    FROM "brands" b
   WHERE b."deleted_at" IS NULL
     AND EXISTS (
       SELECT 1 FROM "products" p
        WHERE p."brand_id" = b."id"
          AND p."deleted_at" IS NULL
          AND p."status" = 'ACTIVE'
     )
),
tokens AS (
  SELECT lower(f_unaccent(token)) AS word
    FROM source,
         LATERAL regexp_split_to_table(source.content, '[^[:alnum:]]+') AS token
   WHERE length(token) >= 3
)
SELECT
  t.word,
  count(*)::int AS occurrences,
  (SELECT l.lexeme FROM unnest(to_tsvector('portuguese', t.word)) AS l LIMIT 1) AS lexeme
FROM tokens t
GROUP BY t.word;

-- Unique é requisito do `REFRESH ... CONCURRENTLY`; o agrupamento já garante.
CREATE UNIQUE INDEX "search_lexemes_word_idx" ON "search_lexemes" ("word");
-- O único índice trigrama do projeto. Com a Z5 o trigrama nunca toca o texto do
-- produto: ele compara palavra digitada com palavra conhecida, e só isso.
CREATE INDEX "search_lexemes_word_trgm_idx" ON "search_lexemes" USING GIN ("word" gin_trgm_ops);
-- Presença por radical: "racao" é palavra conhecida se alguma linha tem o mesmo
-- lexema, mesmo que a forma escrita no catálogo seja "rações".
CREATE INDEX "search_lexemes_lexeme_idx" ON "search_lexemes" ("lexeme");
