#!/usr/bin/env node
// Mede o contraste de cada par de cor do design system e falha se algum cair
// abaixo do alvo WCAG. A fonte da verdade é o próprio `src/app/globals.css`:
// este script lê os tokens de lá, não uma cópia. Contraste é verificação, não
// estimativa — ver docs/design-system.md.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "app",
  "globals.css",
);

// ── Pares medidos ────────────────────────────────────────────────────────────
// 4.5 é texto de corpo; 3.0 é elemento de interface (borda de campo, anel de
// foco, superfície de destaque) e texto grande.
//
// A lista é o que os componentes de fato desenham, não o produto cartesiano dos
// tokens. Onde a superfície é translúcida — `bg-input/30`, `hover:bg-muted/50` —
// o par declara `alpha` e o `over` sobre o qual ela é composta, porque é a cor
// composta que a pessoa enxerga e nenhum token guarda esse valor. `only` marca
// o par que só existe num tema, porque a classe que o desenha é `dark:`.
const TEXT = 4.5;
const UI = 3;

/** @typedef {{ fg: string, bg: string, target: number, alpha?: number, over?: string, only?: string }} Pair */
/** @type {Pair[]} */
const PAIRS = [
  { fg: "foreground", bg: "background", target: TEXT },
  { fg: "foreground", bg: "card", target: TEXT },
  { fg: "foreground", bg: "muted", target: TEXT },
  { fg: "foreground", bg: "secondary", target: TEXT },
  { fg: "foreground", bg: "accent", target: TEXT },
  { fg: "popover-foreground", bg: "popover", target: TEXT },
  { fg: "muted-foreground", bg: "background", target: TEXT },
  { fg: "muted-foreground", bg: "card", target: TEXT },
  { fg: "muted-foreground", bg: "muted", target: TEXT },
  { fg: "muted-foreground", bg: "secondary", target: TEXT },
  { fg: "muted-foreground", bg: "accent", target: TEXT },
  { fg: "muted-foreground", bg: "sidebar", target: TEXT },
  { fg: "primary", bg: "background", target: TEXT },
  { fg: "primary", bg: "card", target: TEXT },
  { fg: "primary", bg: "muted", target: TEXT },
  { fg: "primary", bg: "secondary", target: TEXT },
  { fg: "primary", bg: "accent", target: TEXT },
  { fg: "primary-foreground", bg: "primary", target: TEXT },
  { fg: "primary-foreground", bg: "primary-hover", target: TEXT },
  { fg: "secondary-foreground", bg: "secondary", target: TEXT },
  { fg: "accent-foreground", bg: "accent", target: TEXT },
  { fg: "highlight-foreground", bg: "highlight", target: TEXT },
  { fg: "highlight-foreground", bg: "highlight-hover", target: TEXT },
  { fg: "destructive", bg: "background", target: TEXT },
  { fg: "destructive", bg: "card", target: TEXT },
  { fg: "destructive-foreground", bg: "destructive", target: TEXT },
  { fg: "destructive-foreground", bg: "destructive-hover", target: TEXT },
  { fg: "sidebar-foreground", bg: "sidebar", target: TEXT },
  { fg: "sidebar-foreground", bg: "sidebar-accent", target: TEXT },
  { fg: "sidebar-primary-foreground", bg: "sidebar-primary", target: TEXT },
  { fg: "sidebar-accent-foreground", bg: "sidebar-accent", target: TEXT },

  // Superfícies translúcidas que os componentes do shadcn desenham.
  // Campo e botão de contorno no escuro: `dark:bg-input/30`, `dark:hover:bg-input/50`.
  {
    fg: "foreground",
    bg: "input",
    alpha: 0.3,
    over: "background",
    target: TEXT,
    only: "Escuro",
  },
  {
    fg: "foreground",
    bg: "input",
    alpha: 0.5,
    over: "background",
    target: TEXT,
    only: "Escuro",
  },
  {
    fg: "muted-foreground",
    bg: "input",
    alpha: 0.3,
    over: "background",
    target: TEXT,
    only: "Escuro",
  },
  // Hover fantasma no escuro: `dark:hover:bg-muted/50`.
  {
    fg: "foreground",
    bg: "muted",
    alpha: 0.5,
    over: "background",
    target: TEXT,
    only: "Escuro",
  },
  {
    fg: "muted-foreground",
    bg: "muted",
    alpha: 0.5,
    over: "background",
    target: TEXT,
    only: "Escuro",
  },
  // Badge secundário como link: `[a]:hover:bg-secondary/80`.
  {
    fg: "secondary-foreground",
    bg: "secondary",
    alpha: 0.8,
    over: "background",
    target: TEXT,
  },

  { fg: "input", bg: "background", target: UI },
  { fg: "input", bg: "card", target: UI },
  { fg: "ring", bg: "background", target: UI },
  { fg: "ring", bg: "card", target: UI },
  { fg: "highlight", bg: "background", target: UI },
  { fg: "highlight", bg: "card", target: UI },
];

// ── Cor ──────────────────────────────────────────────────────────────────────
const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (c) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

function oklchToRgb([L, C, H]) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, linearToSrgb(c))));
}

const luminance = ([r, g, b]) =>
  0.2126 * srgbToLinear(r) +
  0.7152 * srgbToLinear(g) +
  0.0722 * srgbToLinear(b);

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (rgb) =>
  `#${rgb
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;

// ── Leitura dos tokens ───────────────────────────────────────────────────────
function block(css, selector) {
  const match = css.match(selector);
  if (!match) throw new Error(`bloco ${selector} não encontrado em ${CSS}`);
  const open = css.indexOf("{", match.index);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function tokens(body) {
  const found = new Map();
  const re = /--([a-z0-9-]+):\s*oklch\(([^)]+)\)/gi;
  for (const [, name, args] of body.matchAll(re)) {
    const parts = args.trim().split(/\s+/).map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) {
      throw new Error(`--${name}: oklch(${args}) não é L C H`);
    }
    found.set(name, oklchToRgb(parts));
  }
  return found;
}

const css = readFileSync(CSS, "utf8");
const themes = {
  Claro: tokens(block(css, /^:root,\s*\n\.light\s*\{/m)),
  Escuro: tokens(block(css, /^\.dark\s*\{/m)),
};

// ── Todo token tem par ───────────────────────────────────────────────────────
const failures = [];
const [light, dark] = [themes.Claro, themes.Escuro];
for (const name of light.keys()) {
  if (!dark.has(name))
    failures.push(`--${name} existe no claro e não no escuro`);
}
for (const name of dark.keys()) {
  if (!light.has(name))
    failures.push(`--${name} só é definido dentro de .dark, sem base`);
}

// ── Medição ──────────────────────────────────────────────────────────────────
/** Composição do CSS: a cor translúcida sobre o backdrop, em sRGB. */
const composite = (fg, alpha, over) =>
  fg.map((c, i) => alpha * c + (1 - alpha) * over[i]);

let measured = 0;
for (const [theme, set] of Object.entries(themes)) {
  console.log(`\n### ${theme}\n`);
  console.log("| Frente | Fundo | Medido | Alvo | |");
  console.log("|---|---|---|---|---|");
  for (const { fg, bg, target, alpha, over, only } of PAIRS) {
    if (only !== undefined && only !== theme) continue;
    measured++;
    const front = set.get(fg);
    const surface = set.get(bg);
    const backdrop = over === undefined ? undefined : set.get(over);
    if (!front || !surface || (over !== undefined && !backdrop)) {
      failures.push(`${theme}: par ${fg}/${bg} referencia token inexistente`);
      continue;
    }
    const back =
      alpha === undefined ? surface : composite(surface, alpha, backdrop);
    const label =
      alpha === undefined
        ? `\`--${bg}\` ${toHex(back)}`
        : `\`--${bg}\` a ${alpha * 100}% sobre \`--${over}\` = ${toHex(back)}`;
    const ratio = contrast(front, back);
    const ok = ratio >= target;
    if (!ok) {
      failures.push(
        `${theme}: ${fg} sobre ${label.replace(/`/g, "")} — ${ratio.toFixed(2)}:1 < ${target}:1`,
      );
    }
    console.log(
      `| \`--${fg}\` ${toHex(front)} | ${label} | ${ratio.toFixed(2)}:1 | ${target.toFixed(1)}:1 | ${ok ? "AA" : "**FALHA**"} |`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problema(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n${measured} pares medidos, todos dentro do alvo.`);
