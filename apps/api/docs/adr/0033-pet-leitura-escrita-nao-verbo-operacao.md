# Pet — leitura × escrita, e não um verbo por operação

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Catálogo de features*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`read:pet`/`manage:pet` e o par `:others`. Do lado do cliente os quatro verbos sobre o próprio
pet andam sempre juntos — separar criaria feature morta. Do lado do staff, a fronteira que
existe de verdade no balcão é "consultar a ficha" × "alterar a ficha", e ela justifica as duas.
Marcar um pet como falecido é `manage:pet` comum: `deceasedAt` não destrói nada (é exatamente o
ponto de [índice de ADRs](README.md#domínio-pet-shop)), então não merece feature própria.
