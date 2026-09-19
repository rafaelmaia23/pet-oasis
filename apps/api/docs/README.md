# Documentação da API — o mapa

Cada pasta aqui guarda **um tipo** de documento, e o tipo decide por quanto tempo ele vive.
Perdido? A pergunta é sempre "isto é vocabulário, decisão ou consulta?". O que é **trabalho**
(tracker, índice das fases, backlog) e o que é **do sistema** (ADRs que atravessam apps, guias
do fluxo, config das skills) mora na raiz do monorepo — o mapa de lá é
[`docs/README.md`](../../../docs/README.md).

## As pastas

| Onde | O que guarda | Vive |
|---|---|---|
| [`../CONTEXT.md`](../CONTEXT.md) | O **vocabulário** do contexto: glossário puro (o que cada termo é, sinônimos a evitar), formato da skill `domain-modeling`; o porquê fica nos ADRs | Sempre |
| [`adr/README.md`](adr/README.md) + [`adr/`](adr/) | O **porquê** de cada decisão, **um ADR por decisão**. O `README.md` é só o índice, por tema | Sempre |
| [`reference/`](reference/) | Consulta pontual: [rotas](reference/endpoints.md), [política de log](reference/logging-policy.md), [schema](reference/schema.md) (por que uma coluna é assim, o que cada fase mudou, invariantes), [histórico das fases](reference/history.md) | Sempre |
| [`guides/`](guides/) | Como fazer: [dev](guides/dev.md), [deploy](guides/deploy.md), [integrar com a API](guides/integrating-with-the-api.md), [documentar endpoint](guides/documenting-endpoints.md) | Sempre |
| [`../../../.scratch/`](../../../.scratch/README.md), [`todo.md`](../../../docs/todo.md), [`backlog`](../../../docs/reference/backlog.md) | Na **raiz**: o tracker, o índice das fases e o backlog — únicos para o monorepo | — |

## Onde procurar o *porquê* de uma decisão

Pelo índice, nunca pela leitura em bloco: abra [`adr/README.md`](adr/README.md), ache a linha
da decisão, e abra **só** o ADR que ela aponta. São quase duzentos ADRs; uma pergunta concreta
precisa de um ou dois. Se o índice não tem a decisão, ela não foi registrada — pergunte, não
invente.

Os ADRs `0001`–`0010` são as decisões **estruturais** (caras de reverter, surpreendentes sem
contexto, resultado de um trade-off real), escritas como ADR desde a origem. Do `0011` em
diante estão as decisões que viviam nos arquivos temáticos de `docs/context/` até 2026-09-18,
uma por arquivo, com o texto original — o porquê da migração está no ADR de sistema
[`0001-domain-docs-follow-the-skill.md`](../../../docs/adr/0001-domain-docs-follow-the-skill.md).

Decisão nova é **ADR novo** (próximo número) mais a linha no índice, na seção do tema. Termo
novo vai para o `CONTEXT.md`, sem racional.

## Depois de mexer em doc

```bash
pnpm docs:check    # na raiz do monorepo
```

Ele prova que todo caminho e toda âncora citados no monorepo — inclusive nos comentários de
`src/` — existem de fato, e que toda spec marcada como fechada nomeia destinos que existem.
