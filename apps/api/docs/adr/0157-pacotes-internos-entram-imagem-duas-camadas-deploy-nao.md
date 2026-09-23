# Os pacotes internos entram na imagem em duas camadas, e o `deploy` não precisa de `injectWorkspacePackages` (11.3)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Desde que a API depende de pacotes do workspace (`packages/*`, por `workspace:*`), os estágios
`build` e `dev` os copiam em **duas** camadas, pelo mesmo critério que já separava os
manifestos do fonte: `COPY --parents packages/*/package.json ./` antes do
`pnpm install --frozen-lockfile`, e `COPY packages packages` depois, junto do fonte da API.
Os manifestos vão antes porque o lockfile lista cada pacote como importer, e o install é do
workspace que o lockfile descreve — o pnpm 12 **não recusa** o install sem eles (cria os
symlinks pendurados em `apps/api/node_modules/@pet-oasis/*` e segue), mas um install que só
funciona por tolerância é acidente esperando bump. Os pacotes inteiros vão depois porque o
`tsconfig.json` da API estende um preset de `packages/tsconfig`, lido pelo `prisma generate`
(carrega o `prisma.config.ts`) e pelo tsup; sem o arquivo na imagem, o build quebra ali, não no
install. O `--parents` preserva o caminho de cada manifesto, e um pacote novo não muda a linha.
No `dev` os presets não têm bind mount: mudança em `packages/*` pede rebuild (`pnpm run dev` já
builda), aceitável para config que muda raramente.

O que a migração para `apps/api` deixou em aberto era o `pnpm deploy`: a partir do pnpm 10 ele
exigia `injectWorkspacePackages: true` no workspace (ou `--legacy`) quando havia dependência de
workspace. Verificado de propósito no pnpm 12.4.2, nos dois cenários: com os pacotes de config
como `devDependencies`, o `deploy --prod` os poda e o `runtime` fica como antes (26 módulos de
topo, nada de `@pet-oasis/*`); e com um pacote de workspace movido temporariamente para
`dependencies`, o `deploy --prod` **funciona sem nenhuma opção nova** e materializa o pacote
dentro do `node_modules` deployado (entrada `file+…` na store autocontida). A exigência era do
pnpm 10, não existe mais — o `pnpm-workspace.yaml` não ganha `injectWorkspacePackages`, e o dia
em que o contrato virar dependência de produção da API não muda nada no Dockerfile além de o
pacote precisar estar buildado (se for consumido de `dist`) antes do `tsup`.
