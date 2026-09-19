# O tsconfig e o Biome da API estendem presets do workspace (11.3)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Onde cada coisa vive*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A rigidez do TypeScript (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), a
semântica de módulo (ESM, resolução de bundler, `verbatimModuleSyntax`) e o estilo do Biome
(aspas duplas, ponto-e-vírgula sempre, indentação por espaço) são regra do **monorepo**, não
preferência da API — o segundo app e o pacote de contratos têm de compilar e lintar pela mesma
régua. Por isso vivem em dois pacotes internos, `packages/tsconfig` (`@pet-oasis/tsconfig`) e
`packages/biome-config` (`@pet-oasis/biome-config`), privados, escopados, **sem build e sem
dependência de runtime** — config pura, consumida por `workspace:*`. Cada um linta a si mesmo
(`pnpm --filter tsconfig lint`, e o Turbo os pega pelo script): por isso o Biome é
`devDependency` dos dois, e o `tsconfig` estende o `biome-config` num `biome.json` próprio — o
`biome-config` é lintado pela própria base, que é o seu `biome.json`. Foram os primeiros pacotes internos do
workspace de propósito: provam que dependência interna resolve, instala e entra no lockfile com
o pacote mais barato possível, antes de o contrato depender disso.

O `tsconfig` publica um preset por alvo — `tsconfig.base.json` (a rigidez e o módulo),
`tsconfig.node.json` (base + `types: ["node"]`), `tsconfig.next.json` (base + o que o
`create-next-app` gera; nasce sem consumidor e é validado quando o web entra) e
`tsconfig.library.json` (base + `lib: ["esnext"]`, porque biblioteca que roda em servidor e em
navegador não pode depender dos globais de nenhum dos dois). O `tsconfig.json` da API estende o
de Node e guarda **só** o que é relativo ao próprio diretório: `rootDir`, `outDir`, `paths`,
`typeRoots` e `include` — caminho escrito num preset resolveria a partir do preset, não do app.
O `biome.json` da API estende a base e guarda só os ignores que são dela (Prisma gerado,
`api-collection`, `dist`, o constants de imagens fake).

Dois detalhes que não são gosto. Os presets chamam-se `tsconfig.<alvo>.json`, e não
`<alvo>.json`, porque têm comentários e o Biome só lê JSON com comentários em arquivos cujo nome
casa `tsconfig*.json` — assim o `lint` do próprio pacote os aceita sem mexer no parser JSON de
todo mundo. E os dois pacotes não declaram `peerDependencies` em `typescript` e
`@biomejs/biome`: o pnpm auto-instala peers, o que daria a cada pacote uma dependência que ele
não usa (o `tsconfig` não roda TypeScript). O que cada um declara é o que **roda** nele — o
Biome, para o `lint`. A versão única das ferramentas é assunto do `catalog:` do workspace.

A migração foi provada **sem** tocar `src/` nem `tests/`: `tsc --showConfig` (opções e lista de
arquivos) e `biome rage` idênticos antes e depois, mais um teste negativo (mudar a base e ver a
API refletir) para provar que o `extends` está vivo e não silenciosamente ignorado. A única
opção que mudou de valor depois disso foi por decisão do dono, na revisão: o `jsx: "react-jsx"`
que a API carregava desde o `tsc --init` saiu da base — nenhum preset o usa (o de Next
sobrescreve para `preserve`) e não há `.tsx` no programa; `jsx` volta a ser assunto de quem tem
JSX.
