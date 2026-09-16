# Domain Docs

Como as skills de engenharia devem consumir a documentação de domínio deste repo ao explorar o
código. O layout é **single-context** (um contexto só, sem monorepo), mas **não** usa o
`CONTEXT.md` na raiz: a convenção daqui é anterior e mais granular.

## Antes de explorar, leia nesta ordem

1. **[`CLAUDE.md`](../../CLAUDE.md)** na raiz — o essencial acionável: camadas, convenções e as
   regras de negócio **já decididas** (que não se re-decidem).
2. **[`docs/context.md`](../context.md)** — é um **índice**, um roteador: uma linha por decisão,
   apontando o arquivo temático que a contém.
3. **Só o arquivo temático da decisão** que você precisa, em [`docs/context/`](../context/):
   `authorization`, `lifecycle`, `identity-and-sessions`, `api-contracts`, `architecture`,
   `security`, `observability`, `infrastructure`, `pet-domain`, `schema`, `history`.
4. **[`docs/adr/`](../adr/)** — os ADRs que tocam a área em que você vai mexer. Decisão estrutural
   vive aqui; o contexto guarda só o ponteiro.

> ⚠️ **Nunca leia os arquivos de `docs/context/` em bloco, nem "para ter contexto".** Juntos passam
> de 25 mil tokens; uma tarefa concreta precisa de um ou dois. O protocolo é: índice → identifique a
> decisão → abra apenas aquele arquivo. Se o índice não tiver a decisão, ela não foi registrada:
> **pergunte, não invente.**

## Estrutura de arquivos

```
/
├── CLAUDE.md                 ← regras acionáveis + regras de negócio firmadas
├── docs/
│   ├── context.md            ← ÍNDICE (leia este; é o roteador)
│   ├── context/              ← o porquê longo, quebrado por tema
│   │   ├── authorization.md
│   │   ├── pet-domain.md
│   │   └── …
│   ├── adr/                  ← decisões estruturais
│   │   ├── product-catalog-modeling.md
│   │   └── …
│   ├── todo.md               ← índice das fases (ver docs/agents/issue-tracker.md)
│   └── reference/            ← endpoints, política de log, backlog
├── .scratch/                 ← o tracker: specs e issues, versionado
└── src/
```

Não existe `CONTEXT.md` na raiz nem `CONTEXT-MAP.md`, e **não se deve criar um**: seria um segundo
sistema de documentação de domínio ao lado do que já existe. Se uma skill pedir `CONTEXT.md`, o
equivalente aqui é o par `CLAUDE.md` (vocabulário e regras firmadas) + `docs/context.md` (índice).

## Ao acrescentar uma decisão

Escreva no **arquivo temático** (um `###` com o título da decisão) **e** acrescente a linha
correspondente no índice `docs/context.md` — os dois juntos, senão a decisão fica inalcançável.
Decisão estrutural vira ADR em `docs/adr/`, e o contexto guarda só o ponteiro. Decisão revertida é
**reescrita** narrando a reversão, nunca duplicada como decisão + errata.

Depois de mexer em doc, rode **`npm run docs:check`**: ele prova que todo caminho e toda âncora
citados no repo (inclusive nos comentários de `src/`) existem de fato.

## Use o vocabulário do projeto

Quando sua saída nomear um conceito de domínio (título de item no `docs/todo.md`, proposta de
refactor, hipótese, nome de teste), use o termo como o projeto o define — `Product` é identidade
comercial e `ProductVariant` é a unidade vendável; espécie de pet é **faceta** do produto, nunca
nível da árvore de `Category`; perfil é definido pela **presença** da relação, não por um campo
"tipo". Não deslize para sinônimos.

Se o conceito que você precisa não está em lugar nenhum, isso é um sinal: ou você está inventando
linguagem que o projeto não usa (reconsidere), ou há uma lacuna real (registre-a).

## Sinalize conflito com um ADR

Se sua saída contradiz um ADR existente, diga isso em voz alta em vez de sobrescrever em silêncio:

> _Contradiz o `docs/adr/authorization-scope-and-lifecycle.md` (override pendurado na atribuição de
> role), mas vale reabrir porque…_

E lembre: contradizer um ADR é quase sempre **decisão de negócio**. Apresente os caminhos e a
consequência de cada um, e espere a decisão do usuário.
