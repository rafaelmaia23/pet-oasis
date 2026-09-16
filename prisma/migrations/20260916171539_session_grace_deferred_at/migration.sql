-- Escrita à mão, como a migration das imagens (9.10) e a da busca (9.9): o
-- `prisma migrate dev` gera, junto da coluna nova, um `ALTER COLUMN
-- search_vector DROP DEFAULT` e o drop dos índices GIN em products/brands. É
-- drift falso — as duas colunas são GENERATED ALWAYS AS e o Prisma só as
-- conhece como `Unsupported`. Aplicar aquele trecho quebraria a busca inteira;
-- por isso só a parte nova ficou.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "grace_deferred_at" TIMESTAMP(3);
