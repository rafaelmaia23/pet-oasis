/**
 * Valida os links da documentação do monorepo inteiro: todo caminho
 * `docs/**.md` citado em qualquer arquivo (markdown, código ou config) precisa
 * existir, e toda âncora `#slug` usada num link markdown precisa corresponder a
 * um heading real.
 *
 * Existe porque a documentação é referenciada de lugares que envelhecem em
 * ritmos diferentes — os próprios docs, comentários em `src/` de cada app, os
 * READMEs, o tracker — e um caminho quebrado só aparece quando alguém tenta
 * seguir o link. Roda em cada fecho de issue, junto de `typecheck` e `lint`.
 *
 * Num monorepo há dois `docs/`: o da raiz (sistema) e o de cada app. Uma menção
 * em prosa `docs/<arquivo>.md` resolve contra o **pacote** do arquivo que a cita (a
 * raiz, ou o `apps/<x>`/`packages/<x>` que o contém); de fora do app, o doc dele
 * é citado com o prefixo, `apps/api/docs/<arquivo>.md`, e resolve da raiz. Se o pacote
 * não tem o arquivo, a raiz é tentada — é como um app cita `docs/todo.md`.
 *
 * O tracker (`.scratch/`) só existe na raiz, então uma menção a ele — a pasta de
 * um esforço ou um arquivo dele — resolve sempre da raiz. E a forma das pastas do
 * tracker também é regra checada aqui: pasta = esforço, `fase-<n>-<slug>/`, com
 * `spec.md` dentro (`docs/adr/0002-tracker-folders-are-phases.md`).
 *
 * Uso: `pnpm docs:check` (na raiz)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".claude",
  ".turbo",
  "dist",
  "coverage",
  "generated",
  // O build e o cache do Next (apps/web): gerado, fora do git.
  ".next",
  // Notas pessoais de estudo, fora do git (.gitignore): não são documentação.
  ".learning",
]);
const SCANNED_EXTENSIONS = [
  ".md",
  ".ts",
  // Os componentes do web citam a documentação dele em comentário, como a API.
  ".tsx",
  ".mjs",
  // Os comentários do schema do Prisma citam ADRs e a política de log.
  ".prisma",
  ".json",
  ".jsonc",
  ".yml",
  ".yaml",
  ".bru",
];

/** Diretórios que são um pacote do workspace: a raiz e cada `apps/*`, `packages/*`. */
const PACKAGE_ROOTS = [
  ROOT,
  ...["apps", "packages"].flatMap((group) => listDirs(join(ROOT, group))),
];

/**
 * Documentos de trabalho que foram **dissolvidos de propósito** e continuam
 * citados em prosa histórica ("o documento X foi dissolvido na 8.9"). A menção
 * está certa; o arquivo é que não deve existir. Só entra aqui documento cuja
 * ausência é a informação — nunca link que apenas quebrou.
 */
const DISSOLVED_DOCS = new Set(["docs/fase-8-redesign.md"]);

/**
 * Spec de fase fechada. O fecho não apaga a pasta — marca a spec, e o
 * marcador nomeia para onde o *porquê* foi promovido:
 *
 *   Status: fechada em 2026-09-30 — porquê promovido a apps/api/docs/adr/0196-<slug>.md
 *
 * Verificar isto aqui é o que repõe a força que o antigo "apagar a spec no
 * fecho" dava à regra de migrar-antes-de-fechar: sem a remoção, a promoção
 * viraria boa intenção. Spec sem a linha `Status:` é lida como aberta, que é o
 * default certo — quem está no meio do trabalho não deve nada.
 */
const CLOSED_SPEC = /^Status:\s*fechada\b/;

/**
 * Um caminho de documento como aparece em prosa: `docs/<arquivo>.md`, ou com o
 * prefixo do pacote (`apps/api/docs/<arquivo>.md`). É a mesma forma nos dois
 * lugares em que o script a procura — a linha `Status:` da spec fechada e
 * qualquer menção —, e mudar a regra de prefixo tem de mudar as duas de uma vez.
 */
const DOC_PATH = String.raw`((?:apps|packages)\/[\w-]+\/)?(docs\/[\w./-]+\.md)`;
const CLOSED_SPEC_DESTINATION = new RegExp(
  String.raw`\b(?:${DOC_PATH}|CLAUDE\.md|CONTEXT\.md)`,
);
const DOC_MENTION = new RegExp(String.raw`(?<![\w/.-])${DOC_PATH}\b`, "g");

/**
 * Uma menção ao tracker como aparece em prosa: a pasta de uma fase, com ou sem a
 * barra final (`.scratch/fase-11-monorepo/`), ou um caminho dentro dela
 * (`.scratch/fase-11-monorepo/issues/07-root-docs-skeleton.md`). O que vier depois
 * é resolvido inteiro contra a raiz, então um segmento com erro de digitação
 * também reprova. Um ponto final de frase colado ao caminho é aparado; uma
 * menção interrompida por `<` é placeholder de guia (`.scratch/fase-<n>-<slug>/`)
 * e é ignorada.
 */
const SCRATCH_MENTION = /(?<![\w/.-])\.scratch\/[\w.-]+(?:\/[\w./-]*)?/g;

/** O tracker só existe na raiz; toda menção a ele resolve daqui. */
const SCRATCH_DIR = join(ROOT, ".scratch");

/**
 * A forma de uma pasta do tracker: **pasta = esforço**, `fase-<n>-<slug>`, com o
 * número global da fase sem zero à esquerda (o mesmo da branch do esforço, que é o
 * nome da pasta) e o slug em kebab-case. Dois esforços da mesma fase compartilham o
 * número, então o padrão é checado **por diretório** e não exige número único. O
 * porquê — e para onde vai o trabalho que não é de nenhuma fase — está em
 * `docs/adr/0002-tracker-folders-are-phases.md`.
 */
const EFFORT_FOLDER = /^fase-[1-9]\d*-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `line` é `null` quando o problema é de um diretório, não de uma linha de arquivo. */
type Problem = { file: string; line: number | null; message: string };

function listDirs(dir: string): string[] {
  if (!exists(dir)) return [];
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((full) => statSync(full).isDirectory());
}

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

/** O pacote do workspace que contém o arquivo — o mais profundo que o contém. */
function packageRootOf(file: string): string {
  let best = ROOT;
  for (const root of PACKAGE_ROOTS) {
    if (file.startsWith(`${root}/`) && root.length > best.length) best = root;
  }
  return best;
}

const problems: Problem[] = [];

function report(file: string, line: number | null, message: string): void {
  problems.push({ file: relative(ROOT, file), line, message });
}

// A forma do tracker: cada diretório de `.scratch/` é um esforço de uma fase, nomeado
// `fase-<n>-<slug>`, e tem a `spec.md` dele.
for (const dir of listDirs(SCRATCH_DIR)) {
  const name = relative(SCRATCH_DIR, dir);
  if (!EFFORT_FOLDER.test(name)) {
    report(
      dir,
      null,
      `pasta do tracker fora do padrão \`fase-<n>-<slug>\` (número da fase sem zero à esquerda, slug em kebab-case): ${name}`,
    );
  }
  if (!exists(join(dir, "spec.md"))) {
    report(dir, null, `pasta do tracker sem spec.md: ${name}`);
  }
}

for (const file of collectFiles(ROOT)) {
  const lines = readFileSync(file, "utf8").split("\n");
  const isMarkdown = file.endsWith(".md");
  const relativePath = relative(ROOT, file);
  const packageRoot = packageRootOf(file);

  // Spec fechada: a linha `Status: fechada` tem que nomear ao menos um destino
  // permanente; a existência do caminho é coberta pela checagem de prosa abaixo.
  if (/^\.scratch\/[^/]+\/spec\.md$/.test(relativePath)) {
    const statusLine = lines.find((line) => CLOSED_SPEC.test(line));
    if (statusLine && !CLOSED_SPEC_DESTINATION.test(statusLine)) {
      report(
        file,
        lines.indexOf(statusLine) + 1,
        "spec marcada como fechada sem nomear o destino do porquê — acrescente os caminhos dos ADRs que passaram a guardá-lo",
      );
    }
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Links markdown relativos: [texto](caminho.md#ancora)
    if (isMarkdown) {
      // Link para uma pasta (`](../.scratch/fase-12-web-auth-spine/)`): só a
      // existência, não há âncora.
      for (const match of line.matchAll(/]\(([^)\s:]+\/)\)/g)) {
        const target = match[1];
        if (target && !exists(resolve(dirname(file), target))) {
          report(file, lineNumber, `pasta inexistente: ${target}`);
        }
      }
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

    // Menções em prosa ou comentário: `docs/todo.md` (do pacote, senão da raiz)
    // ou, de fora do app, `apps/api/docs/reference/endpoints.md`.
    //
    // O lookbehind é o que impede o caminho de OUTRO repositório de ser lido
    // como nosso: em `../pet-oasis-web/docs/adr/<nome>.md`, o trecho a partir
    // de `docs/` casaria sozinho, e checar a existência dele aqui reprovaria um
    // documento correto. Um caminho precedido de barra não é nosso — salvo o
    // prefixo de pacote, que o próprio padrão captura.
    for (const match of line.matchAll(DOC_MENTION)) {
      const [target, packagePrefix, docPath] = match;
      if (!docPath || DISSOLVED_DOCS.has(docPath)) continue;
      // Sem prefixo: o pacote do arquivo primeiro e a raiz como segunda tentativa
      // (é como um app cita `docs/todo.md`); na raiz, os dois são o mesmo lugar.
      const candidates = packagePrefix
        ? [join(ROOT, target)]
        : [
            join(packageRoot, docPath),
            ...(packageRoot === ROOT ? [] : [join(ROOT, docPath)]),
          ];
      if (!candidates.some(exists)) {
        report(file, lineNumber, `caminho inexistente: ${target}`);
      }
    }

    // Menções ao tracker: `.scratch/fase-11-monorepo/` ou um caminho dentro dela.
    // É o que prova que renomear uma pasta de fase não deixou ponteiro para trás.
    for (const match of line.matchAll(SCRATCH_MENTION)) {
      if (line[match.index + match[0].length] === "<") continue;
      const target = match[0].replace(/\.$/, "");
      if (!exists(join(ROOT, target))) {
        report(file, lineNumber, `caminho inexistente: ${target}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`✗ ${problems.length} problema(s) na documentação:\n`);
  for (const { file, line, message } of problems) {
    console.error(`  ${line === null ? file : `${file}:${line}`} — ${message}`);
  }
  process.exit(1);
}

console.log("✓ documentação: caminhos, âncoras e pastas do tracker em ordem");
