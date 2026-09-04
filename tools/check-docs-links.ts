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

/**
 * Documento **efêmero** — spec ou issue em `.scratch/`, o tracker — não pode
 * ser citado por documento permanente (9.12/AC5, retargetado na Fase 10).
 *
 * A regra existe porque ela já falhou por disciplina: um ADR citava um `§` de
 * um documento de planejamento escrito para ser descartável, e o link
 * sobreviveu a uma revisão. Versionar o `.scratch/` (Fase 10) mudou a
 * durabilidade do arquivo, **não** a autoridade do conteúdo: uma spec é o
 * retrato de uma negociação num instante, e envelhece assim que a
 * implementação diverge dela.
 *
 * Casa só a citação de um **arquivo**; nomear o diretório é legítimo (é o que
 * o mapa e os guias fazem ao descrever o layout).
 */
const EPHEMERAL_DOC = /\.scratch\/[\w./-]+\.[\w]+/g;

/**
 * Quem pode citar documento efêmero. Cada entrada tem um motivo, e um motivo
 * que deixa de valer é entrada que sai:
 *
 * - `docs/todo.md` — é o tracker, e efêmero também: enquanto a fase está
 *   aberta, ele aponta para a spec dela em vez de repeti-la.
 * - `docs/README.md` — o mapa da documentação; os caminhos ali são o desenho
 *   do fluxo, não referência a um documento que exista.
 * - `docs/agents/issue-tracker.md` e `docs/guides/todo-phases.md` — descrevem o
 *   layout do tracker, então precisam nomeá-lo.
 * - este próprio arquivo — os padrões acima são dados, não citação.
 *
 * Além destes, **todo arquivo dentro de `.scratch/`**: o tracker citando o
 * tracker é o caso normal (uma issue aponta para a spec, a spec para outra
 * issue), e nada ali é permanente.
 */
const MAY_CITE_EPHEMERAL = new Set([
  "docs/todo.md",
  "docs/README.md",
  "docs/agents/issue-tracker.md",
  "docs/guides/todo-phases.md",
  "tools/check-docs-links.ts",
]);

/** Prefixos cujo conteúdo inteiro pode citar efêmero. */
const EPHEMERAL_CITERS = [".scratch/"];

/**
 * Spec de esforço fechado. O fecho não apaga a pasta — marca a spec, e o
 * marcador nomeia para onde o *porquê* foi promovido:
 *
 *   Status: fechada em 2026-09-30 — porquê promovido a docs/adr/<nome>.md
 *
 * Verificar isto aqui é o que repõe a força que o antigo "apagar a spec no
 * fecho" dava à regra de migrar-antes-de-fechar: sem a remoção, a promoção
 * viraria boa intenção. Spec sem a linha `Status:` é lida como aberta, que é o
 * default certo — quem está no meio do trabalho não deve nada.
 */
const CLOSED_SPEC = /^Status:\s*fechada\b/;

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
  const relativePath = relative(ROOT, file);
  const mayCiteEphemeral =
    MAY_CITE_EPHEMERAL.has(relativePath) ||
    EPHEMERAL_CITERS.some((prefix) => relativePath.startsWith(prefix));

  // Spec fechada: os destinos que ela nomeia precisam existir de fato. A
  // checagem de caminho `docs/**.md` acima já cobre a maioria; esta acrescenta
  // que a linha `Status: fechada` tem que nomear ao menos um destino.
  if (/^\.scratch\/[^/]+\/spec\.md$/.test(relativePath)) {
    const statusLine = lines.find((line) => CLOSED_SPEC.test(line));
    if (statusLine && !/\b(docs\/[\w./-]+\.md|CLAUDE\.md)/.test(statusLine)) {
      report(
        file,
        lines.indexOf(statusLine) + 1,
        "spec marcada como fechada sem nomear o destino do porquê — acrescente os caminhos de docs/adr/ ou docs/context/ que passaram a guardá-lo",
      );
    }
  }

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

    // Menções em prosa ou comentário: `docs/reference/endpoints.md`.
    //
    // O lookbehind é o que impede o caminho de OUTRO repositório de ser lido
    // como nosso: em `../pet-oasis-web/docs/adr/<nome>.md`, o trecho a partir
    // de `docs/` casaria sozinho, e checar a existência dele aqui reprovaria um
    // documento correto. Um caminho precedido de barra não é nosso.
    for (const match of line.matchAll(/(?<![\w/.-])docs\/[\w./-]+\.md\b/g)) {
      const target = match[0];
      if (DISSOLVED_DOCS.has(target)) continue;
      if (!exists(join(ROOT, target))) {
        report(file, lineNumber, `caminho inexistente: ${target}`);
      }
    }

    if (mayCiteEphemeral) return;

    for (const match of line.matchAll(EPHEMERAL_DOC)) {
      report(
        file,
        lineNumber,
        `documento permanente citando efêmero: ${match[0]} — promova o conteúdo a ADR ou a docs/context/ e cite o destino`,
      );
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
