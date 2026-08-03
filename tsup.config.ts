import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    seed: "prisma/seed.ts",
    "cleanup-sessions": "src/scripts/cleanup-sessions.ts",
    "cleanup-audit-log": "src/scripts/cleanup-audit-log.ts",
    "demo-reset": "src/scripts/demo-reset.ts",
  },
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
});
