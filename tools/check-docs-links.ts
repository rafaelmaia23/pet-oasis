/**
 * Valida os links da documentação: todo caminho `docs/**.md` citado em qualquer
 * arquivo do repo (markdown, código ou config) precisa existir, e toda âncora
 * `#slug` usada num link markdown precisa corresponder a um heading real.
 *
 * Existe porque a documentação é referenciada de três lugares que envelhecem em
 * ritmos diferentes — os próprios docs, comentários em `src/` e o README —, e um
 * caminho quebrado só aparece quando alguém tenta seguir o link. Roda em cada
 * fecho de fase, junto da auditoria de doc.
 *
 * Uso: `npm run docs:check`
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "generated",
]);
const SCANNED_EXTENSIONS = [".md", ".ts", ".json", ".yml", ".yaml", ".bru"];

/**
 * Documentos de trabalho que foram **dissolvidos de propósito** e continuam
 * citados em prosa histórica ("o documento X foi dissolvido na 8.9"). A menção
 * está certa; o arquivo é que não deve existir. Só entra aqui documento cuja
 * ausência é a informação — nunca link que apenas quebrou.
 */
const DISSOLVED_DOCS = new Set(["docs/fase-8-redesign.md"]);

type Problem = { file: string; line: number; message: string };

/**
 * Replica a geração de âncora do GitHub: minúsculas, remove tudo que não é
 * letra/número/espaço/hífen/underscore (Unicode-aware, então acento sobrevive),
 * e cada espaço vira um hífen — **um por espaço**, sem colapsar, que é o detalhe
 * que faz um heading com pontuação no meio ("A — B") virar `a--b`. Link markdown
 * no heading conta só pelo texto, não pela URL. Duplicatas ganham sufixo numérico
 * na ordem de aparição.
 */
function slugify(heading: string): string {
  return heading
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-_]/gu, "")
    .replace(/\s/g, "-");
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
    } else if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/** Âncoras disponíveis num markdown, com o mesmo desempate do GitHub. */
function anchorsOf(file: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (!match?.[1]) continue;
    const base = slugify(match[1]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

const anchorCache = new Map<string, Set<string>>();
function cachedAnchors(file: string): Set<string> {
  let anchors = anchorCache.get(file);
  if (!anchors) {
    anchors = anchorsOf(file);
    anchorCache.set(file, anchors);
  }
  return anchors;
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

const problems: Problem[] = [];

function report(file: string, line: number, message: string): void {
  problems.push({ file: relative(ROOT, file), line, message });
}

for (const file of collectFiles(ROOT)) {
  const lines = readFileSync(file, "utf8").split("\n");
  const isMarkdown = file.endsWith(".md");

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Links markdown relativos: [texto](caminho.md#ancora)
    if (isMarkdown) {
      for (const match of line.matchAll(/]\(([^)\s]+\.md)(#[^)\s]*)?\)/g)) {
        const [, target, hash] = match;
        if (!target || /^[a-z]+:\/\//.test(target)) continue;
        const resolved = resolve(dirname(file), target);
        if (!exists(resolved)) {
          report(file, lineNumber, `arquivo inexistente: ${target}`);
          continue;
        }
        if (hash) {
          const anchor = decodeURIComponent(hash.slice(1));
          if (anchor && !cachedAnchors(resolved).has(anchor)) {
            report(file, lineNumber, `âncora inexistente: ${target}${hash}`);
          }
        }
      }
    }

    // Menções em prosa ou comentário: `docs/reference/endpoints.md`
    for (const match of line.matchAll(/\bdocs\/[\w./-]+\.md\b/g)) {
      const target = match[0];
      if (DISSOLVED_DOCS.has(target)) continue;
      if (!exists(join(ROOT, target))) {
        report(file, lineNumber, `caminho inexistente: ${target}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`✗ ${problems.length} link(s) quebrado(s) na documentação:\n`);
  for (const { file, line, message } of problems) {
    console.error(`  ${file}:${line} — ${message}`);
  }
  process.exit(1);
}

console.log("✓ documentação: todos os caminhos e âncoras existem");
