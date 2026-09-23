# Issue tracker: markdown local em `.scratch/`

Este repo **não usa um issue tracker externo**. Não existe GitHub Issues em uso, não existe
`gh` instalado, e nenhuma skill deve tentar criar issue remota. Specs e issues vivem como
markdown versionado dentro do próprio repo, em `.scratch/` da raiz do monorepo — um tracker só,
uma numeração de fase só, para API, contratos e web.

## Onde fica cada coisa

| Arquivo | O que guarda |
| --- | --- |
| [`.scratch/fase-<n>-<slug>/spec.md`](../../.scratch/) | O desenho negociado de uma fase: problema, solução, decisões, escopo de fora. |
| [`.scratch/fase-<n>-<slug>/issues/NN-<slug>.md`](../../.scratch/) | Uma issue por arquivo, numerada a partir de `01` em ordem de dependência. É o tracker propriamente dito. |
| [`docs/todo.md`](../todo.md) | O **índice** das fases: estado de cada uma, ponteiro para a pasta da fase aberta, resumo destilado das fechadas. |
| [`docs/reference/backlog.md`](../reference/backlog.md) | O que foi levantado e **conscientemente adiado** — sem fase, sem data. |

O caminho completo, da ideia ao código, está em [`docs/README.md`](../README.md); as duas
formas de uma fase no `todo.md`, em [`docs/guides/todo-phases.md`](../guides/todo-phases.md).

## A forma de uma pasta: pasta = fase

Todo diretório de `.scratch/` é uma fase, nomeado `fase-<n>-<slug>/` — flat, número global da
fase sem zero à esquerda, slug em kebab-case (o app no slug só quando a fase é de um só, como
`fase-12-web-auth-spine`). A skill prescreve `<feature-slug>` sem ordem; aqui o número é o que
ordena o `ls` e casa a pasta com a branch `fase-<n>`. Não há subpasta por app: uma fase
atravessa apps. **Não existe pasta sem número.** Trabalho que não é fase tem três destinos, e
nenhum deles é uma pasta nova:

- correção pontual ou ajuste de processo → branch solta a partir da `dev` (`fix/<slug>`,
  `docs/<slug>`), sem tracker;
- ideia sem fase → [`docs/reference/backlog.md`](../reference/backlog.md);
- pendência descoberta no meio de uma fase → issue nova na pasta da fase aberta.

O `pnpm docs:check` reprova pasta fora do padrão ou sem `spec.md`. O porquê está em
[`docs/adr/0002`](../adr/0002-tracker-folders-are-phases.md).

## A forma de uma issue

Uma issue é uma **fatia vertical**: atravessa schema, API e teste, é verificável sozinha, e
cabe num contexto fresco. Não é uma fatia horizontal de uma camada.

```markdown
# NN: <título>

**What to build:** o comportamento ponta a ponta que esta issue faz funcionar, do ponto de
vista de quem usa — não uma lista camada a camada.

**Blocked by:** os números que travam esta, ou "None (can start immediately)".

**Status:** ready-for-agent

- [ ] Critério de aceite 1
- [ ] Critério de aceite 2
```

Sem caminho de arquivo e sem trecho de código: envelhecem rápido. A exceção é um trecho que
codifica uma decisão com mais precisão que a prosa (máquina de estados, shape de tipo,
schema) — esse entra, aparado só na parte que decide.

**A exceção à fatia vertical é o refactor largo**: uma mudança mecânica cujo raio de impacto
atinge o repo inteiro (renomear um serviço do Compose, retipar um símbolo compartilhado).
Sequencie como expand–contract em issues próprias, em vez de forçar numa fatia.

## Convenções de branch e numeração

- Branch de fase: `fase-<n>`, a partir da `dev`.
- Branch de issue: `feat/fase-<n>-<NN>-<slug>`, a partir da branch da fase.
- O `<NN>` é **local à fase** (reinicia em `01` a cada fase); o `<n>` da fase é **global e
  nunca reinicia**. É a combinação dos dois que dá nome não-ambíguo à branch.
- Trabalho fora de fase sai da `dev` em branch descritiva (`chore/<slug>`, `fix/<slug>`,
  `docs/<slug>`) e volta por merge `--no-ff`.

## Fechar uma issue

Marque os critérios de aceite e descreva o que de fato ficou pronto, não o que estava
planejado. Item que veio do backlog também é marcado lá
([`docs/reference/backlog.md`](../reference/backlog.md)), senão a entrada vira lixo que
ressurge no fecho da fase seguinte.

## Fechar uma fase

1. Cada decisão nomeada na spec ganha dono permanente — um **ADR** (no app dono da decisão, ou
   em `docs/adr/` da raiz quando é de sistema) e a linha no índice. **Migrar antes de fechar**:
   decisão sem dono não é fechada; escrever o dono é o trabalho.
2. A primeira linha do `spec.md` vira
   `Status: fechada em <AAAA-MM-DD> — porquê promovido a <caminhos>`. O `pnpm docs:check`
   exige que os caminhos nomeados existam.
3. A fase encolhe no [`docs/todo.md`](../todo.md) para o resumo de resultado.

A pasta **não é apagada**: o histórico da negociação fica legível, e o marcador é o que
impede alguém de ler uma spec morta como corrente.

## A regra que mais quebra: pendência vai para a frente, nunca para trás

Ao terminar um trabalho, uma pendência para uma etapa **futura** vira **uma issue nova** na
pasta da fase — nunca uma nota ao fim da issue recém-fechada. Anotar para trás garante que
ninguém leia a nota na hora certa.

## Quando uma skill disser "publicar no issue tracker"

Escreva um arquivo de issue em `.scratch/fase-<n>-<slug>/issues/`. Se o item não pertence a
nenhuma fase planejada, ele vai para `docs/reference/backlog.md` — com o problema que resolve e
o esforço estimado (**P** = uma issue · **M** = uma feat-branch · **G** = fase própria), que é o
formato daquele arquivo. Nunca crie um arquivo de tickets novo ao lado desses dois.

## Quando uma skill disser "buscar o ticket relevante"

Leia `.scratch/fase-<n>-<slug>/issues/NN-*.md`. O usuário normalmente passa o número. Para o
*porquê* por trás do item, siga o ponteiro para a spec da fase, para o índice de ADRs do app
(`apps/api/docs/adr/README.md`) ou para o ADR citado — ver [`docs/agents/domain.md`](domain.md).

## Operações de wayfinding

Usadas pelo `/wayfinder`. O **mapa** é um arquivo com um **filho** por ticket.

- **Mapa**: `.scratch/fase-<n>-<slug>/map.md`, com o corpo Destino / Notas / Decisões-até-agora /
  Névoa / Fora de escopo.
- **Filho**: `.scratch/fase-<n>-<slug>/issues/NN-<slug>.md`, numerado a partir de `01`, com a
  pergunta no corpo. Uma linha `Tipo:` registra o tipo (`research`/`prototype`/`grilling`/
  `task`); uma linha `Status:` registra `claimed`/`resolved`.
- **Bloqueio**: linha `Bloqueado por: NN, NN` no topo. Desbloqueado quando todos os arquivos
  citados estão `resolved`.
- **Fronteira**: varra `.scratch/fase-<n>-<slug>/issues/` por arquivos abertos, desbloqueados e não
  reclamados; vence o de menor número.
- **Reclamar**: `Status: claimed`, salvo **antes** de qualquer trabalho.
- **Resolver**: a resposta sob `## Resposta`, `Status: resolved`, e um ponteiro de contexto
  acrescentado às Decisões-até-agora do mapa.
