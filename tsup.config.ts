import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
});
