import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Load .env.test into process.env for the whole Vitest run (main process +
// globalSetup's execSync children + workers, which inherit process.env). This
// makes `npx vitest run <file>` work standalone — no dotenv-cli prefix needed —
// and keeps the test DB URL in a single place (.env.test). override:true guards
// against a stray DATABASE_URL exported in the shell clobbering the test DB.
dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: "./src/__tests__/setup/global.ts",
    setupFiles: ["./src/__tests__/setup/zod-matchers.ts"],
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
    },
  },
});
