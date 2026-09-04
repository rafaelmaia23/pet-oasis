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

/** As cinco séries categóricas, na ordem em que um gráfico as consome. */
const SERIES = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

/** Distância mínima em OKLab entre duas séries, inclusive sob dicromacia.
 *  Abaixo disso duas fatias de um gráfico deixam de ser a mesma pergunta
 *  respondida de dois jeitos e viram a mesma cor. */
const SERIES_FLOOR = 0.05;

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

  // Série de gráfico: marca de dado é elemento de interface, não texto.
  ...SERIES.flatMap((fg) => [
    { fg, bg: "background", target: UI },
    { fg, bg: "card", target: UI },
  ]),
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

/** Viénot, Brettel & Mollon 1999 — simulação de dicromacia, em sRGB linear. */
const LMS = [
  [0.31399, 0.63951, 0.04649],
  [0.15537, 0.75789, 0.0867],
  [0.01775, 0.10944, 0.87247],
];
const LMS_INV = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
];
const DICHROMACY = {
  protanopia: [
    [0, 1.05118294, -0.05116099],
    [0, 1, 0],
    [0, 0, 1],
  ],
  deuteranopia: [
    [1, 0, 0],
    [0.9513092, 0, 0.04866992],
    [0, 0, 1],
  ],
  tritanopia: [
    [1, 0, 0],
    [0, 1, 0],
    [-0.86744736, 1.86727089, 0],
  ],
};
const apply = (m, v) =>
  m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

function simulate(rgb, kind) {
  const linear = rgb.map(srgbToLinear);
  const seen = apply(LMS_INV, apply(DICHROMACY[kind], apply(LMS, linear)));
  return seen.map((c) => Math.min(1, Math.max(0, linearToSrgb(c))));
}

function toOklab([r, g, b]) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function separation(a, b) {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
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

// ── Séries de gráfico ────────────────────────────────────────────────────────
// Contraste já foi medido acima. Falta a pergunta que só um conjunto tem: duas
// séries continuam distinguíveis uma da outra? A matiz sozinha não responde —
// sob dicromacia ela colapsa, e o que sobra é a luminosidade.
for (const [theme, set] of Object.entries(themes)) {
  console.log(`\n### Séries de gráfico — ${theme}\n`);
  console.log("| Visão | Menor distância | Par | Piso | |");
  console.log("|---|---|---|---|---|");
  for (const vision of ["normal", "deuteranopia", "protanopia", "tritanopia"]) {
    let closest = Number.POSITIVE_INFINITY;
    let pair = "";
    for (let i = 0; i < SERIES.length; i++) {
      for (let j = i + 1; j < SERIES.length; j++) {
        const one = set.get(SERIES[i]);
        const other = set.get(SERIES[j]);
        if (!one || !other) {
          failures.push(
            `${theme}: série ${SERIES[i]} ou ${SERIES[j]} não existe`,
          );
          continue;
        }
        const seen = (rgb) =>
          vision === "normal" ? rgb : simulate(rgb, vision);
        const d = separation(seen(one), seen(other));
        if (d < closest) {
          closest = d;
          pair = `${SERIES[i]} / ${SERIES[j]}`;
        }
      }
    }
    const ok = closest >= SERIES_FLOOR;
    if (!ok) {
      failures.push(
        `${theme}: ${pair} sob ${vision} — distância ${closest.toFixed(3)} < ${SERIES_FLOOR}`,
      );
    }
    console.log(
      `| ${vision} | ${closest.toFixed(3)} | \`--${pair.replace(" / ", "` / `--")}\` | ${SERIES_FLOOR.toFixed(2)} | ${ok ? "ok" : "**FALHA**"} |`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problema(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\n${measured} pares medidos, todos dentro do alvo.`);
