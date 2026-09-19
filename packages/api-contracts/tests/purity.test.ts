import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda de pureza: é o `.strict()` da regra "o contrato só depende de `zod`".
// O pacote atravessa a rede — o web (e amanhã o mobile) o importa —, então
// qualquer outra dependência, ou qualquer import que saia de `src/`, é sinal de
// que a coisa não é contrato (Prisma, Express, helper de servidor, alias `@/`
// da API). A regra vale como texto no CLAUDE.md da raiz; este teste é o que a
// faz ficar vermelha em vez de virar hábito.

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const SRC_DIR = join(PACKAGE_ROOT, "src");

// Toda forma de trazer módulo: `import x from`, `import "x"`, `export * from`,
// `import()` e `require()`. Captura o especificador entre aspas.
const SPECIFIER_RE =
  /(?:\bimport\s*(?:[\w*{}\s,]*\bfrom\s*)?|\bexport\s*(?:[\w*{}\s,]*\bfrom\s*)|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function specifiersOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(SPECIFIER_RE)].map((match) => match[1] ?? "");
}

function isInsideSrc(file: string, specifier: string): boolean {
  const target = resolve(dirname(file), specifier);
  return !relative(SRC_DIR, target).startsWith("..");
}

describe("pureza do contrato", () => {
  it("declara `zod` como única dependência de runtime", () => {
    const manifest = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(Object.keys(manifest.dependencies ?? {})).toEqual(["zod"]);
  });

  it("não importa nada de fora de `src/` além de `zod`", () => {
    const files = listSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.flatMap((file) =>
      specifiersOf(file)
        .filter((specifier) => {
          if (specifier === "zod") return false;
          if (specifier.startsWith(".")) return !isInsideSrc(file, specifier);
          return true; // especificador nu: `@/`, `@prisma/…`, `express`, `apps/…`
        })
        .map((specifier) => `${relative(PACKAGE_ROOT, file)} → ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });
});
