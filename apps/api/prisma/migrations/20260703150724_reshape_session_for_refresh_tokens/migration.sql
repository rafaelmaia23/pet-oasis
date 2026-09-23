-- Sessões antigas usam o esquema de token bruto validado a cada request e não
-- sobrevivem à mudança para refresh token opaco rotativo. Aceitável em dev/test.
TRUNCATE TABLE "sessions";

-- DropIndex
DROP INDEX "sessions_token_key";

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "token",
ADD COLUMN     "refresh_token_hash" TEXT NOT NULL,
ADD COLUMN     "used_at" TIMESTAMP(3),
ADD COLUMN     "user_agent" TEXT,
ADD COLUMN     "ip_address" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");
