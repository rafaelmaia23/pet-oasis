# Cada pasta do tracker é um esforço de uma fase, nomeada `fase-<n>-<slug>`

> Decisão de sistema. **Primeira versão em 2026-09-21** — grelha pós-import da Fase 11,
> executada na issue 15 de `.scratch/fase-11-monorepo/issues/15-scratch-folders-are-phases.md`:
> pasta = fase. **Reescrita em 2026-09-23**, na grelha que desenhou o esforço
> `fase-12-module-depth`, para narrar a reversão parcial: pasta = **esforço**, e uma fase tem
> de um a n esforços. Vale para o tracker inteiro (`.scratch/` da raiz).

A skill de setup prescreve `.scratch/<feature-slug>/`: uma pasta por feature, sem ordem. Depois
do import do web o tracker tinha três pastas em três convenções — `fase-10-frontline/`,
`monorepo/` e `foundation-and-auth-spine/` —, e quem listava o diretório não sabia, sem abrir
nada, qual pasta era qual fase, em que ordem vinham, nem a que branch cada uma correspondia. A
primeira versão desta decisão resolveu isso com **pasta = fase**: `fase-<n>-<slug>/`, flat, com
o número global da fase, casando 1:1 com a branch `fase-<n>`.

**O que a reversão descobriu.** Dois dias depois, a ordem de execução mudou: a profundidade dos
módulos da API e do contrato precisou passar na frente da espinha de autenticação do web, porque
é o web que consome o que ela muda. Com pasta = fase = branch, honrar a ordem nova exigia
**renumerar** — 14 ocorrências do caminho da pasta em 13 arquivos, mais prosa em 16 —, e
exigiria de novo na vez seguinte. O diagnóstico: o problema não era "pasta = fase", era
**"fase = branch"**. O termo *fase* carregava três papéis de uma vez — capítulo do roadmap,
unidade de branch/PR/deploy, e pasta do tracker —, e o 1:1 pasta↔branch que a primeira versão
celebrava só funcionava porque houve, por acidente, uma pasta por número. As Fases 10
("desbloqueio do front **e** dívida de deploy") e 11 (monorepo, contrato e import do web) já
eram multi-assunto: a fase nunca foi mono-tema de verdade.

**Decidimos** que **pasta = esforço**:

- **Fase** é capítulo do roadmap: um número global, um título, uma entrada em `docs/todo.md`.
  Não é branch, não é PR. Ela agrupa de um a n esforços e ganha ✅ quando o último deles fecha.
- **Esforço** é a unidade de trabalho e de entrega: uma pasta `.scratch/fase-<n>-<slug>/`, uma
  branch **com o mesmo nome da pasta** (a branch `fase-12-module-depth` ↔ a
  pasta `fase-12-module-depth/` do tracker), um PR para a `dev`, um fecho próprio — ADRs, a linha
  `Status:` na spec dela e o bloco destilado no `todo.md`. O 1:1 pasta↔branch fica **mais**
  forte, não mais fraco: agora é por construção, não por acidente.
- O número **não é único** entre pastas: dois esforços da mesma fase compartilham o `<n>`, e o
  `ls` os deixa vizinhos. O `<NN>` da issue é local ao esforço e reinicia em `01`; a branch de
  issue carrega o nome do esforço (`feat/fase-12-module-depth-02-error-codes`), senão dois
  `feat/fase-12-02-…` poderiam existir ao mesmo tempo.

**O que a primeira versão acertou e continua valendo:** o nome é `fase-<n>-<slug>/`, flat, com o
número **sem zero à esquerda** (a branch é `fase-11`, não `fase-011`), slug em kebab-case, e
`spec.md` dentro. **Não existe pasta sem número:** trabalho que não é de nenhuma fase é branch
solta a partir da `dev`, entrada em `docs/reference/backlog.md`, ou issue nova num esforço
aberto — e é aqui que o termo "esforço" muda de sentido em relação à primeira versão, que o
aposentara justamente como nome de pasta *sem* número. Pasta sem número continua não existindo;
o que voltou é a palavra, agora para a pasta *com* número. **Subpasta por app segue rejeitada**
(um `api/` e um `web/` dentro do tracker) porque um esforço atravessa apps; o app aparece no
slug quando o esforço é de um só (`fase-12-web-auth-spine`).

O padrão continua **provado pelo `pnpm docs:check`**, e sem mudança de código: o regex é
aplicado **por diretório** (`fase-<n>-<slug>` + `spec.md` presente), então número repetido entre
pastas sempre passou. Toda menção em prosa a `.scratch/<pasta>/` ou a um arquivo dela tem de
resolver — é o que garante que renomear uma pasta corrija toda citação no mesmo passo.

**"Esforço" não entra em `CONTEXT.md` nenhum**: é termo de processo, não de domínio, e
`CONTEXT.md` é glossário de domínio puro (`docs/adr/0001-domain-docs-follow-the-skill.md`). Ele
mora no `CLAUDE.md` da raiz, aqui, e nos documentos do tracker.
