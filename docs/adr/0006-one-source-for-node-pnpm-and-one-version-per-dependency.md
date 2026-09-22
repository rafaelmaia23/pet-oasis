# Node, pnpm e cada dependência compartilhada têm uma fonte só, na raiz

> Decisão de sistema, nascida na execução da Fase 11 (issues 01 e 11) e registrada no fecho
> (issue 13). Vale para todo pacote do workspace. Até aqui o racional vivia só em comentário
> de `pnpm-workspace.yaml` e nas issues `.scratch/fase-11-monorepo/issues/01-pnpm-single-package.md`
> e `.scratch/fase-11-monorepo/issues/11-import-web.md`.

Num monorepo, "qual versão?" tem de ter **uma** resposta, e ela não pode estar em dois lugares
— senão o CI, a máquina de quem desenvolve e a imagem Docker instalam coisas diferentes, e o
sintoma aparece longe da causa. São quatro perguntas, e cada uma tem um lugar só:

**Qual Node e qual pnpm:** o `package.json` da raiz, e só ele. `engines.node` declara a versão
do Node; o campo `packageManager` pina o pnpm com hash, e o corepack o instala a partir daí. A
consequência que importa é que **nenhum Dockerfile escreve versão de pnpm**: os estágios rodam
`corepack enable` e recebem o que o `packageManager` disser — uma versão a bumpar, não três. E
o pnpm **recusa `install` quando o Node não satisfaz `engines`**, o que transforma "a imagem
está num Node diferente do host" num erro de install, na hora, em vez de um comportamento
divergente em produção (foi o que levou a imagem de `node:22` para `node:24` na issue 01).
Pré-requisito de toda máquina nova, incluindo o VPS: `corepack enable`.

**Onde fica a configuração do pnpm:** em `pnpm-workspace.yaml`, não em `.npmrc`. O `.npmrc`
**não existe** neste repo — o pnpm 12 lê a configuração dele do `pnpm-workspace.yaml`, e
manter um `.npmrc` ao lado seria um segundo lugar plausível para procurar e não achar. Os
timeouts de fetch moram lá.

**Quem pode rodar script de install:** a lista `allowBuilds` do `pnpm-workspace.yaml` — o
equivalente pnpm do `allowScripts` do npm. Postinstall é execução de código de terceiro no
`install`, então vale por allowlist: `bcrypt`, `prisma`, `@prisma/engines`, `esbuild` e
`vue-demi` (que o `@scalar/api-reference` traz para a documentação da API — o postinstall dele
só lê a versão do Vue instalada e escolhe o build 2 ou 3). **`sharp` não entra**, ao contrário
do que a spec previa: a 0.35 não tem script de install. A prova de que a lista está completa é
um `docker build --no-cache` sem nenhum aviso de script bloqueado, mais `bcrypt` e `sharp`
carregando na suíte e na imagem podada.

**Qual versão de uma dependência que aparece em mais de um pacote:** o bloco `catalog:` do
`pnpm-workspace.yaml`. Cada `package.json` escreve `catalog:` no lugar do range, e o range vive
num lugar só — é o que impede "funciona no web, quebra no contrato" por diferença de versão, e
o que faz um bump ser **uma linha** em vez de uma caça por pacote. A regra de escolha é **a
mais nova sem breaking grande**, com duas exceções que o próprio arquivo carrega:

- **TypeScript 6, não 7.** O 7 já existe, e é a reescrita nativa em Go — não passou pelo crivo
  de "sem breaking grande". (O medo que motivou o catálogo era o oposto: Next 16 poderia não
  aceitar TS 6, e a API teria de **descer**. Verificado na issue 11 — o Next 16.3.4 não declara
  `typescript` como peer, e `next typegen`, `tsc --noEmit` e `next build` passaram com 6.0.x.)
- **`@types/node` 24, casando com `engines.node`**, e não a 25 que a API tinha. Tipo acima do
  runtime compila código que quebra em produção; é a versão do Node que manda, não a mais nova
  do pacote de tipos.

O que decorre disso, e vale como regra: **dependência que passa a aparecer em dois pacotes vai
para o `catalog:` no mesmo commit** — foi assim que Zod, tsx e Vitest entraram no import do web
—, e um bump de Node é sempre um par (`engines.node` e `@types/node` juntos, ou nenhum).
