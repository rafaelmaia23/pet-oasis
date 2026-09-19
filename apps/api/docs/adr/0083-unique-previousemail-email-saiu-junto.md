# O `@unique` de `PreviousEmail.email` saiu junto (K25)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Troca de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Com o reuso liberado, o unique vira bomba-relógio: B larga o endereço X; A adota X; A troca de email
de novo → o `previousEmail.create` da confirmação estoura P2002 e a troca de A falha com 409 **para
sempre**, sem caminho de volta e sem que o usuário entenda o porquê. Histórico se repete: o mesmo
endereço pertence a várias contas ao longo do tempo, e uma conta pode voltar a um endereço que já
largou. Sem `findPreviousEmailByEmail` (apagada), não sobrou nem leitura por email para o índice
servir.
