# Triage Labels

As skills falam em cinco papéis canônicos de triagem. Este arquivo mapeia cada papel para a string
usada de fato neste repo. **Mantivemos os nomes padrão** — a string é igual ao papel.

| Papel nas skills | Rótulo aqui | Significado |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Precisa ser avaliado antes de virar trabalho |
| `needs-info` | `needs-info` | Esperando informação de quem reportou |
| `ready-for-agent` | `ready-for-agent` | Totalmente especificado, pronto para um agente rodar sozinho |
| `ready-for-human` | `ready-for-human` | Exige implementação humana (ou decisão de negócio pendente) |
| `wontfix` | `wontfix` | Não será feito |

## Como o rótulo é gravado

Não há tracker externo com labels (ver `docs/agents/issue-tracker.md`), então o rótulo é uma linha
`Triagem: <rótulo>` logo abaixo do item, em `docs/todo.md` ou em `docs/reference/backlog.md`:

```markdown
- ⬜ Comprimento máximo em todo campo de texto
  Triagem: ready-for-agent
```

Item sem linha `Triagem:` conta como `needs-triage`: o default é "ainda não avaliado", nunca
"pronto para rodar". A linha some quando o item é concluído — o emoji de estado (`✅`/`⬜`/`🔄`/`🔸`)
é o que sobrevive.

## Onde a triagem para

Um item que dependa de **regra de negócio, design de domínio ou trade-off de produto** nunca é
`ready-for-agent`: é `ready-for-human`, mesmo que a implementação seja trivial. Essa é a regra
crítica do `CLAUDE.md` — o agente não decide regra de negócio sozinho.
