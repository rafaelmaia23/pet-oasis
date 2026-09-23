# Os presenters garantem que a doc não vaza segredo

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Documentação da API*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

As views já derrubam campos não listados via `.parse()` (`passwordHash`, `tokenHash`,
`refreshTokenHash` nunca entram na resposta). Como os exemplos de response no OpenAPI saem **das
mesmas views**, o documento herda a garantia — verificado por teste (`openapi.test.ts`: a spec não
contém nenhum desses campos). Documentar a partir da whitelist é mais seguro que anotar exemplos à
mão, que poderiam reintroduzir um campo sensível por descuido.
