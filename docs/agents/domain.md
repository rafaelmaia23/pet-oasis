# Domain Docs

Como as skills de engenharia devem consumir a documentação de domínio deste repo ao explorar o
código. O layout é **multi-contexto**, no formato da skill `domain-modeling` **sem adaptação**:
[`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) na raiz lista um contexto por app; cada app tem o
próprio `CONTEXT.md` (glossário) e os próprios ADRs; decisões de sistema ficam em
[`docs/adr/`](../adr/) da raiz.

## Antes de explorar, leia nesta ordem

1. **[`CLAUDE.md`](../../CLAUDE.md)** da raiz — fluxo, regras transversais, onde mora cada
   documento — e o **`CLAUDE.md` do app** em que vai mexer ([`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md)):
   camadas, convenções e as regras de negócio **já decididas** (que não se re-decidem).
2. **[`CONTEXT-MAP.md`](../../CONTEXT-MAP.md)** — em que contexto o assunto vive.
3. **`CONTEXT.md` do app** — o que cada termo significa. O da API (`apps/api/CONTEXT.md`) nasce
   na Fase 11, issue 08; até lá, o vocabulário firmado está nas regras de negócio do `CLAUDE.md`
   da API.
4. **[`apps/<app>/docs/adr/README.md`](../../apps/api/docs/adr/README.md)** — é um **índice**, um
   roteador: uma linha por decisão, agrupada por tema, apontando o ADR que a contém.
5. **Só o ADR da decisão** que você precisa. Os `0001`–`0010` da API são as decisões
   estruturais (caras de reverter); do `0011` em diante, uma decisão por arquivo.
6. **[`docs/adr/`](../adr/)** da raiz — só quando o assunto atravessa apps (fronteira, contrato,
   modo de trabalho).

> ⚠️ **Nunca leia os ADRs em bloco, nem "para ter contexto".** Os da API somam quase duzentos e
> passam de 25 mil tokens; uma tarefa concreta precisa de um ou dois. O protocolo é: mapa →
> glossário → índice → identifique a decisão → abra apenas aquele ADR. Se o índice não tiver a
> decisão, ela não foi registrada: **pergunte, não invente.**

## Estrutura de arquivos

```
/
├── CLAUDE.md                     ← fluxo e regras transversais do monorepo
├── CONTEXT-MAP.md                ← um contexto por app, com o caminho do CONTEXT.md de cada um
├── docs/
│   ├── adr/                      ← decisões de SISTEMA (0001-…)
│   ├── todo.md                   ← índice das fases (ver docs/agents/issue-tracker.md)
│   ├── reference/backlog.md
│   └── agents/                   ← este diretório
├── .scratch/                     ← o tracker: specs e issues, versionado, único
└── apps/api/
    ├── CLAUDE.md                 ← o específico da stack + regras de negócio firmadas
    ├── CONTEXT.md                ← glossário do contexto (issue 08)
    ├── docs/
    │   ├── adr/
    │   │   ├── README.md         ← ÍNDICE por tema (leia este; é o roteador)
    │   │   ├── 0001-auth-token-revocation.md
    │   │   ├── …
    │   │   └── 0195-ultima-variante-ativa-decidida-sob-lock.md
    │   ├── reference/            ← endpoints, política de log, schema, histórico
    │   └── guides/
    └── src/
```

Não existe `CONTEXT.md` na raiz — o repo tem mais de um contexto, então o que existe na raiz é
o `CONTEXT-MAP.md`, como a skill pede. Não existe mais `docs/context/`: o que vivia lá virou um
ADR por decisão (migração de 2026-09-18, [`docs/adr/0001`](../adr/0001-domain-docs-follow-the-skill.md)).

## Ao acrescentar uma decisão

Escreva um **ADR novo** no app dono da decisão (próximo número em `docs/adr/`, formato de
`ADR-FORMAT.md` da skill: título que é a decisão, 1–3 parágrafos com contexto e porquê) **e**
acrescente a linha correspondente no índice `apps/<app>/docs/adr/README.md`, na seção do tema —
os dois juntos, senão a decisão fica inalcançável. Decisão que atravessa apps vai em `docs/adr/`
da raiz. Decisão revertida é **reescrita** narrando a reversão, nunca duplicada como decisão +
errata; reversão grande marca o ADR antigo como `superseded by ADR-NNNN`.

Termo novo ou termo que ganhou significado mais preciso vai para o `CONTEXT.md` do app — e **só
o termo**, com a definição de uma ou duas linhas e os sinônimos a evitar. O glossário não guarda
racional nem implementação; se a definição precisa de porquê, ela aponta para o ADR.

Spec e issue de `.scratch/` **podem** ser citadas de um ADR ou de um comentário — são arquivos
fixos do tracker versionado. Depois de mexer em doc, rode **`pnpm docs:check`** na raiz: ele
prova que todo caminho e toda âncora citados no monorepo (inclusive nos comentários de `src/`)
existem de fato.

## Use o vocabulário do projeto

Quando sua saída nomear um conceito de domínio (título de item no `docs/todo.md`, proposta de
refactor, hipótese, nome de teste), use o termo como o projeto o define — `Product` é identidade
comercial e `ProductVariant` é a unidade vendável; espécie de pet é **faceta** do produto, nunca
nível da árvore de `Category`; perfil é definido pela **presença** da relação, não por um campo
"tipo". Não deslize para sinônimos.

Se o conceito que você precisa não está em lugar nenhum, isso é um sinal: ou você está inventando
linguagem que o projeto não usa (reconsidere), ou há uma lacuna real (registre-a — no glossário,
se é termo; em ADR, se é decisão).

## Sinalize conflito com um ADR

Se sua saída contradiz um ADR existente, diga isso em voz alta em vez de sobrescrever em silêncio:

> _Contradiz o `apps/api/docs/adr/0005-authorization-scope-and-lifecycle.md` (override pendurado
> na atribuição de role), mas vale reabrir porque…_

E lembre: contradizer um ADR é quase sempre **decisão de negócio**. Apresente os caminhos e a
consequência de cada um, e espere a decisão do usuário.
