-- Escrita à mão, como a migration da busca (9.9): o `prisma migrate dev` gera,
-- junto da tabela nova, um `ALTER COLUMN search_vector DROP DEFAULT` e o drop
-- dos índices GIN em products/brands. É drift falso — as duas colunas são
-- GENERATED ALWAYS AS e o Prisma só as conhece como `Unsupported`. Aplicar
-- aquele trecho quebraria a busca inteira; por isso só a parte nova ficou.

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_images_product_id_position_idx" ON "product_images"("product_id", "position");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
