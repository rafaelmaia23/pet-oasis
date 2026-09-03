# Documentação do pet-oasis — o mapa

Cada pasta aqui guarda **um tipo** de documento, e o tipo decide por quanto tempo ele vive.
Perdido? A pergunta é sempre "isto é rascunho, negociação, decisão ou consulta?".

## As pastas

| Onde | O que guarda | Vive |
|---|---|---|
| [`.scratch/`](../.scratch/) *(fora do git)* | Ideia crua, brainstorming, material de grilling | Até virar spec |
| [`specs/`](specs/) | O desenho negociado de uma fase ou esforço; mapas do `/wayfinder` | Até o trabalho fechar |
| [`todo.md`](todo.md) | O trabalho **ordenado**: fases, sessões, itens, e o que de fato ficou pronto | Sempre (a fase fechada encolhe) |
| [`reference/backlog.md`](reference/backlog.md) | Levantado e **conscientemente adiado** — sem fase, sem data | Sempre |
| [`context.md`](context.md) + [`context/`](context/) | O **porquê** de cada decisão. O `context.md` é só o índice | Sempre |
| [`adr/`](adr/) | Decisão **estrutural**: a que é cara de reverter | Sempre |
| [`reference/`](reference/) | Consulta pontual: [rotas](reference/endpoints.md), [política de log](reference/logging-policy.md), backlog | Sempre |
| [`guides/`](guides/) | Como fazer: [dev](guides/dev.md), [deploy](guides/deploy.md), [documentar endpoint](guides/documenting-endpoints.md), [formas de fase](guides/todo-phases.md) | Sempre |
| [`agents/`](agents/) | Como as skills de IA devem ler e escrever tudo isto | Sempre |

## O caminho de uma ideia até o código

```
ideia crua          .scratch/nome.md              rascunho, fora do git
   ↓ /grill-with-docs — a grelha fecha as decisões, uma rodada por vez
desenho             docs/specs/fase-<n>.md        spec: o quê e por quê
   ↓ /to-tickets
trabalho            docs/todo.md                  ordem, sessões, estado
   ↓ /implement — teste primeiro, em feat-branch por item
código              src/ + tests/
   ↓ fecho da fase
memória             docs/adr/ + docs/context/     o porquê, para sempre
```

Duas regras seguram o desenho:

1. **A fronteira spec × todo.** A spec responde *o quê e por quê*; o `todo.md` responde *em
   que ordem, e o que de fato ficou pronto*. Enquanto a fase está aberta, o `todo.md` aponta
   para a spec em vez de repeti-la — foi a duplicação entre os dois que produziu, na Fase 9,
   duas versões da mesma decisão envelhecendo em ritmos diferentes.
2. **Documento permanente nunca cita documento efêmero.** ADR, `context/`, `README`,
   `CLAUDE.md` e comentário de `src/` não referenciam `.scratch/` nem `docs/specs/`. Se algo
   de lá merece ser citado, é porque merece ter virado ADR ou contexto. O
   `npm run docs:check` reprova quem esquecer.

## Onde procurar o *porquê* de uma decisão

Pelo índice, nunca pela leitura em bloco: abra [`context.md`](context.md), ache a linha da
decisão, e abra **só** o arquivo temático que ela aponta. Juntos, os arquivos de `context/`
passam de 25 mil tokens; uma pergunta concreta precisa de um ou dois. Se o índice não tem a
decisão, ela não foi registrada — pergunte, não invente.

Decisão estrutural (cara de reverter, surpreendente sem contexto, resultado de um trade-off
real) vira **ADR** em [`adr/`](adr/); o contexto guarda só o ponteiro.

## Depois de mexer em doc

```bash
npm run docs:check
```

Ele prova que todo caminho e toda âncora citados no repositório — inclusive nos comentários
de `src/` — existem de fato, e que nenhum documento permanente cita rascunho ou spec.
