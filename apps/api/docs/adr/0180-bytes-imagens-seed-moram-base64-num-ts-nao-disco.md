# Os bytes das imagens do seed moram em base64 num `.ts`, não em disco (9.11)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Dataset fake*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O plano herdado da 9.10 previa "um punhado de `.webp` pequenos versionados em
`src/lib/seed/assets/`". Não funcionaria: o estágio `runtime` do `Dockerfile` copia
`node_modules`, `dist`, `prisma`, o `package.json` e o entrypoint — **nunca `src/`** —, e o tsup
empacota TS/JS ignorando `.webp`. Como o entrypoint de produção roda `migrate deploy → seed →
start` a cada boot, o seed simplesmente não encontraria arquivo nenhum, e o sintoma (demo sem foto)
não apontaria para a causa.

`src/lib/seed/fakeImages.constants.ts` guarda os 51 assets em base64 (~2 MB), gerado por
`tools/generate-fake-images.ts` a partir de um diretório `assets-inbox/` que **não é versionado**.
Recusadas as duas alternativas: um `COPY` novo no estágio runtime criaria a primeira dependência de
"arquivo ao lado do bundle" do projeto — classe de erro que só aparece em produção —, e gerar
placeholder em runtime com `sharp` sairia em branco, porque o `node:22-bookworm-slim` não traz fonte
nenhuma para renderizar `<text>` em SVG.

O arquivo fica fora do Biome (`files.includes` em `biome.json`): 2 MB excedem o limite de 1 MB por
arquivo, e formatar código gerado que ninguém lê não paga o ajuste.
