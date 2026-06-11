import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: "./src/__tests__/setup/global.ts",
    setupFiles: ["./src/__tests__/setup/zod-matchers.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5433/pet_oasis_test",
      NODE_ENV: "test",
    },
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
