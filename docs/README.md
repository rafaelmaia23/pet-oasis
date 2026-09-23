# Documentação do pet-oasis — o mapa

Cada pasta aqui guarda **um tipo** de documento, e o tipo decide por quanto tempo ele vive.
Perdido? A pergunta é sempre "isto é trabalho, decisão, vocabulário ou consulta?". E depois:
"é do sistema ou de um app?" — o que é do sistema mora aqui, na raiz; o que é de um app mora no
`docs/` dele.

## As pastas da raiz

| Onde | O que guarda | Vive |
|---|---|---|
| [`../.scratch/`](../.scratch/README.md) | O **tracker**: uma pasta por fase (`fase-<n>-<slug>/`), com a spec e uma issue por arquivo — único para o monorepo | Enquanto a fase existir; fechada, fica marcada |
| [`todo.md`](todo.md) | O **índice** das fases: estado, ponteiro para a fase aberta, e o resumo destilado de cada fase fechada | Sempre |
| [`reference/backlog.md`](reference/backlog.md) | Levantado e **conscientemente adiado** — sem fase, sem data | Sempre |
| [`adr/`](adr/README.md) | Decisões **de sistema**, numeradas `NNNN-slug.md`: o monorepo e o tooling, a infra do sistema, a fronteira entre apps, o modo de trabalho. Uma linha por decisão no **índice**, agrupada por tema — ache a linha, abra só aquele ADR | Sempre |
| [`../CONTEXT-MAP.md`](../CONTEXT-MAP.md) | O mapa dos contextos: um por app, com o caminho do `CONTEXT.md` (glossário) de cada um | Sempre |
| [`guides/`](guides/) | Como fazer, no que vale para o todo: [deploy do stack de produção](guides/deploy.md) (o de um app só vive no `docs/guides/` dele), [formas de fase](guides/todo-phases.md) | Sempre |
| [`agents/`](agents/) | Como as skills de IA devem ler e escrever tudo isto | Sempre |

## As pastas de cada app

| Onde | O que guarda |
|---|---|
| `apps/<app>/CLAUDE.md` | O específico da stack: camadas, convenções, regras de negócio já decididas, comandos |
| `apps/<app>/CONTEXT.md` | O **vocabulário** do contexto — glossário puro, formato da skill `domain-modeling` |
| `apps/<app>/docs/adr/` | O **porquê** de cada decisão do app, um ADR por decisão, com índice por tema em `README.md` |
| `apps/<app>/docs/reference/`, `guides/` | Consulta pontual e como-fazer daquele app |

A API tem um mapa próprio, [`apps/api/docs/README.md`](../apps/api/docs/README.md); o web,
menor, cabe no índice de ADRs dele ([`apps/web/docs/adr/README.md`](../apps/web/docs/adr/README.md))
mais o [`design-system.md`](../apps/web/docs/design-system.md).

## O caminho de uma ideia até o código

```
ideia crua          .scratch/fase-<n>-<slug>/                anotação, material de grilling
   ↓ /grill-with-docs — a grelha fecha as decisões, uma rodada por vez
   ↓ /to-spec
desenho             .scratch/fase-<n>-<slug>/spec.md         spec: o quê e por quê
   ↓ /to-tickets
execução            .scratch/fase-<n>-<slug>/issues/NN-*.md  uma issue = uma feat-branch = um contexto
   ↓ /implement — teste primeiro, em feat-branch por issue
código              apps/<app>/src + tests, packages/<pkg>/src
   ↓ fecho da fase
memória             docs/adr/ (sistema) e apps/<app>/docs/adr/ (app)   o porquê, para sempre
                    apps/<app>/CONTEXT.md                               o vocabulário
                    docs/todo.md                                        o resultado, destilado
```

Duas regras seguram o desenho:

1. **A fronteira tracker × memória.** O `.scratch/` responde *o quê, por quê e em que ordem*
   enquanto o trabalho corre; o [`todo.md`](todo.md) responde *o que de fato ficou pronto*,
   depois. Enquanto a fase está aberta, o `todo.md` **aponta** para a pasta dela em vez de
   repeti-la — foi a duplicação entre os dois que produziu, na Fase 9, duas versões da mesma
   decisão envelhecendo em ritmos diferentes.
2. **Decisão com explicação é ADR; vocabulário é glossário.** O porquê de uma escolha vai para
   um ADR numerado (do app, ou da raiz quando é de sistema) e ganha uma linha no índice; o termo
   vai para o `CONTEXT.md` do app, sem racional. Spec e issue **podem** ser citadas de um ADR —
   são arquivos fixos do tracker versionado, e é assim que a skill funciona; a regra antiga
   "permanente não cita efêmero" caiu na Fase 11 ([`adr/0001`](adr/0001-domain-docs-follow-the-skill.md)).
   O `pnpm docs:check` prova que todo caminho citado existe.

## Onde procurar o *porquê* de uma decisão

Pelo mapa e pelo índice, nunca pela leitura em bloco: [`CONTEXT-MAP.md`](../CONTEXT-MAP.md)
diz em que contexto o assunto vive; o `CONTEXT.md` do app diz o que cada termo significa; o
índice de ADRs tem uma linha por decisão — ache a linha e abra **só** aquele ADR. São três
índices, um por dono: [`adr/README.md`](adr/README.md) aqui, para o que é de sistema;
[`apps/api/docs/adr/README.md`](../apps/api/docs/adr/README.md) e
[`apps/web/docs/adr/README.md`](../apps/web/docs/adr/README.md) para o que é de cada app.
Os ADRs da API somam mais de duzentos; uma pergunta concreta precisa de um ou dois. Se o índice
não tem a decisão, ela não foi registrada — pergunte, não invente.

## Depois de mexer em doc

```bash
pnpm docs:check    # na raiz
```

Ele varre o monorepo inteiro e prova que todo caminho e toda âncora citados — inclusive nos
comentários de `src/` de cada app — existem de fato, e que toda spec marcada como fechada nomeia
destinos que existem. A ferramenta vive em `tools/check-docs-links.ts`.
