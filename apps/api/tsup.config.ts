import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    server: "src/server.ts",
    seed: "prisma/seed.ts",
    "cleanup-sessions": "src/scripts/cleanup-sessions.ts",
    "cleanup-audit-log": "src/scripts/cleanup-audit-log.ts",
    "demo-reset": "src/scripts/demo-reset.ts",
    "refresh-search-lexemes": "src/scripts/refresh-search-lexemes.ts",
  },
  // O contrato (`@pet-oasis/api-contracts`) é consumido do fonte TS, sem
  // build: o `exports` dele aponta para `.ts`. O tsup externaliza toda
  // `dependency` por padrão, e um `import` de `.ts` deixado no `dist/` só
  // rodaria pelo type stripping do Node — frágil demais para produção. Inlinar
  // o pacote é o que torna o bundle autocontido; o `zod` que ele importa
  // continua externo, porque é dependência da própria API.
  noExternal: ["@pet-oasis/api-contracts"],
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  clean: true,
  splitting: false,
  target: "es2022",
});
