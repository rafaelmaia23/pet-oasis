# Issue tracker: markdown local

Este repo **não usa um issue tracker externo**. Não existe GitHub Issues em uso, não existe `gh`
instalado, e nenhuma skill deve tentar criar issue remota. Tarefas, specs e ideias vivem como
markdown versionado dentro do próprio repo.

## Onde fica cada coisa

| Arquivo | O que guarda |
| --- | --- |
| [`docs/todo.md`](../todo.md) | O trabalho **ordenado e agendado**: fases, sessões e seus itens. É o tracker propriamente dito. |
| [`docs/reference/backlog.md`](../reference/backlog.md) | O que foi levantado e **conscientemente adiado** — sem fase, sem data. |
| [`docs/specs/`](../specs/) | Spec longa demais para caber em bullets: o desenho de uma fase ou de um esforço grande. **Efêmera** — apagada no fecho, com o *porquê* promovido a ADR ou a `docs/context/`. |
| [`.scratch/`](../../.scratch/) | Rascunho **fora do git**: ideia crua, brainstorming, material de grilling. Nada aqui é citável. |

O caminho completo, da ideia ao código, está em [`docs/README.md`](../README.md); as duas
formas de uma fase no `todo.md`, em
[`docs/guides/todo-phases.md`](../guides/todo-phases.md).

## Convenções do `docs/todo.md`

- A hierarquia é **fase** (`## Fase <n> — <título>`) → **sessão** (`### [Sessão <n>.<m>] Fase <n>.<m> — <título>`) → **itens** (bullets).
- Estado por emoji, na legenda do topo do arquivo: `✅` feito · `🔄` em andamento · `⬜` a fazer · `🔸` polimento (não bloqueia). O mesmo emoji marca a sessão inteira no seu `###`.
- A fase **em execução** fica expandida (passo-a-passo, decisões de kickoff, pendências); a fase **fechada** é destilada em poucos bullets de resultado, no fecho da **própria** fase. Destilar faz parte do trabalho — o *porquê* migra antes para `docs/context/` ou para um ADR. O molde das duas formas está em [`docs/guides/todo-phases.md`](../guides/todo-phases.md).
- Um item que herda contexto de uma sessão anterior diz de onde veio: `**Herdado da 9.7:** …`.

## A regra que mais quebra: pendência vai para a frente, nunca para trás

Ao terminar um trabalho, uma pendência para uma etapa **futura** é escrita **na seção da sessão que
vai executá-la** — nunca ao fim da seção recém-fechada. Se a seção futura ainda não existe, crie o
placeholder dela. Anotar para trás garante que ninguém leia a nota na hora certa.

## Quando uma skill disser "publicar no issue tracker"

Escreva um bullet `⬜` na seção da sessão de `docs/todo.md` que vai executar aquilo. Se o item não
pertence a nenhuma fase planejada, ele vai para `docs/reference/backlog.md` — com o problema que
resolve e o esforço estimado (**P** = uma sessão · **M** = uma feat-branch · **G** = fase própria),
que é o formato daquele arquivo. Nunca crie um arquivo de tickets novo ao lado desses dois.

Um conjunto grande de tickets (uma fase inteira, uma spec) vira arquivo em `docs/specs/<slug>.md`,
e o `docs/todo.md` só aponta para ele — **só ele**: documento permanente (ADR, `docs/context/`,
`README`, `CLAUDE.md`, comentário de `src/`) nunca cita spec nem rascunho, e o
`npm run docs:check` reprova quem tentar.

## Quando uma skill disser "buscar o ticket relevante"

Leia a seção da sessão correspondente em `docs/todo.md` (ache pelo `### [Sessão <n>.<m>]`). O
usuário normalmente passa o número da sessão. Para o *porquê* por trás do item, siga o ponteiro
para `docs/context.md` ou para o ADR citado — ver `docs/agents/domain.md`.

## Fechar um item

Troque `⬜` por `✅` no bullet e descreva o que de fato ficou pronto, não o que estava planejado.
Item resolvido que veio do backlog também é marcado lá (`docs/reference/backlog.md`), senão a
entrada vira lixo que ressurge no fecho da fase seguinte.

## Operações de wayfinding

Usadas pelo `/wayfinder`. O **mapa** é um arquivo com um **filho** por ticket.

- **Mapa**: `docs/specs/<esforço>-map.md`, com o corpo Notas / Decisões-até-agora / Névoa.
- **Filho**: `docs/specs/<esforço>/NN-<slug>.md`, numerado a partir de `01`, com a pergunta no corpo. Uma linha `Tipo:` registra o tipo (`research`/`prototype`/`grilling`/`task`); uma linha `Status:` registra `claimed`/`resolved`.
- **Bloqueio**: linha `Bloqueado por: NN, NN` no topo. Desbloqueado quando todos os arquivos citados estão `resolved`.
- **Fronteira**: varra `docs/specs/<esforço>/` por arquivos abertos, desbloqueados e não reclamados; vence o de menor número.
- **Reclamar**: `Status: claimed`, salvo **antes** de qualquer trabalho.
- **Resolver**: a resposta sob `## Resposta`, `Status: resolved`, e um ponteiro de contexto acrescentado às Decisões-até-agora do mapa.
