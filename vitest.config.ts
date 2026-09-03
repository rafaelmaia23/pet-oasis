import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Load .env.test into process.env for the whole Vitest run (main process +
// globalSetup's execSync children + workers, which inherit process.env). This
// makes `npx vitest run <file>` work standalone — no dotenv-cli prefix needed —
// and keeps the test DB URL in a single place (.env.test). override:true guards
// against a stray DATABASE_URL exported in the shell clobbering the test DB.
dotenv.config({ path: ".env.test", override: true });

// 9.10/AA: o diretório de upload da suíte é único por run e vive em
// `os.tmpdir()` — nunca dentro do repositório. Dois runs simultâneos não se
// contaminam, e o `clearDatabase` não ganha responsabilidade sobre filesystem
// (foi essa a armadilha do dicionário da busca na 9.9). Fica AQUI, e não no
// globalSetup, porque `src/config/env.ts` é lido no import de cada worker e os
// workers herdam o `process.env` do processo principal — que é o mesmo motivo
// pelo qual o dotenv acima funciona. Quem apaga é o teardown do globalSetup.
process.env.UPLOAD_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "pet-oasis-uploads-"),
);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: "./tests/setup/global.ts",
    setupFiles: ["./tests/setup/zod-matchers.ts"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules/**", "dist/**", "prisma/**", "src/generated/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tests": path.resolve(__dirname, "./tests"),
    },
  },
});
