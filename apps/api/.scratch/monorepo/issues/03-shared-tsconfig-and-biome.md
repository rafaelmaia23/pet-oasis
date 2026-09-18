# 03: `tsconfig` e `biome-config` compartilhados

**What to build:** os dois primeiros pacotes internos do workspace — presets de TypeScript e
a base do Biome — existem em `packages/`, e a API os consome por `workspace:*`. É a issue que
prova que dependência interna funciona (resolução, install, o pacote aparecer no lockfile) com
o pacote mais barato possível, antes de o contrato depender disso.

**Blocked by:** 02.

**Status:** fechada em 2026-09-18

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] `packages/tsconfig` (`@pet-oasis/tsconfig`) publica quatro presets: `tsconfig.base.json`
      (rigidez, semântica de módulo, emit com mapas e tipos, `jsx: react-jsx`),
      `tsconfig.node.json` (base + `types: ["node"]`), `tsconfig.next.json` (base + o que o
      `create-next-app` gera — nasce sem consumidor, validado na 11) e `tsconfig.library.json`
      (base + `lib: ["esnext"]`, sem DOM nem Node). Chamam-se `tsconfig.<alvo>.json`, não
      `<alvo>.json`: têm comentários, e o Biome só lê JSON com comentários em `tsconfig*.json` —
      assim passam limpos pela base do workspace quando o lint cobrir `packages/` (verificado
      com `biome check ../../packages` de dentro da API; hoje nenhum script os cobre). O `tsconfig.json` da API estende o de
      Node e guarda `rootDir`, `outDir`, `paths`, `typeRoots` e `include` (tudo relativo ao
      diretório); o `types` desceu para o preset de Node, porque é o que o define como Node —
      o valor efetivo é o mesmo.
- [x] `packages/biome-config` (`@pet-oasis/biome-config`) publica a base (formatter, linter,
      aspas duplas, ponto-e-vírgula sempre) em `biome.json`, exportada como `./biome`; o da
      API a estende e guarda só os quatro ignores que são dela.
- [x] Privados, escopados, sem build — e **sem dependência nenhuma**, nem `peerDependencies`:
      o pnpm auto-instala peers, o que dava a cada pacote um `node_modules` com a ferramenta
      linkada e uma entrada no lockfile. A versão única de TS/Biome é assunto do `catalog:` (11).
      Aparecem como `workspace:*` nas `devDependencies` da API e como importers vazios no
      lockfile (`packages/tsconfig: {}`); `pnpm install --frozen-lockfile` passa.
- [x] Nenhum valor efetivo mudou, provado mais forte do que a issue pedia: `tsc --showConfig`
      (opções **e** lista de arquivos) e `biome rage --formatter --linter` idênticos antes e
      depois, mais o teste negativo (mudar `strict`/`quoteStyle` na base e ver a API refletir)
      para provar que o `extends` está vivo. Zero mudança em `src/` e `tests/`.
- [x] Suíte completa + `typecheck` + `lint` + `docs:check` verdes; os três targets do Docker
      buildam; `runtime` continua raso, uid 1000, 26 módulos de topo e nenhum `@pet-oasis/*`
      (devDeps podadas pelo `deploy --prod`); `dev` resolve os symlinks para os presets copiados.
- [x] Herança da 02, verificada de propósito — as duas premissas eram do pnpm 10, não do 12:
      (1) o install congelado **não** exige os manifestos dos `packages/*` (cria symlinks
      pendurados e segue); o que quebrava era o `prisma generate`, ao ler um `tsconfig.json`
      que estende arquivo ausente. Mesmo assim os manifestos entram antes do install
      (`COPY --parents packages/*/package.json ./`, um `--parents` que já é estável no
      `dockerfile:1`) — install que só funciona por tolerância é acidente esperando bump — e os
      pacotes inteiros entram depois, junto do fonte (`COPY packages packages`), nos dois
      estágios. (2) O `pnpm deploy --prod` do 12.4.2 **funciona sem `injectWorkspacePackages`**
      também com dependência de workspace em `dependencies` (simulado movendo um pacote e
      revertendo): o pacote é materializado na store autocontida do deploy. Registrado em
      `docs/context/infrastructure.md` (11.3) e na issue 09, que é onde o contrato vira
      dependência de produção — nada a mudar no workspace, só o build do contrato antes do
      tsup se o consumo for de `dist`.
- [x] Docs: decisão de tooling em `docs/context/architecture.md` ("Onde cada coisa vive") e a
      das camadas da imagem em `docs/context/infrastructure.md`, ambas indexadas; README da
      raiz lista os dois pacotes; `CLAUDE.md` da API aponta os presets na linha de stack; a
      issue 14 (estágio base) reflete o install como ficou.
