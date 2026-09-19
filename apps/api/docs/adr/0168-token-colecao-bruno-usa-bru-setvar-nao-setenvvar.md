# O token da coleção Bruno usa `bru.setVar`, não `setEnvVar`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Documentação da API*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O `script:post-response` do request `Login` encadeia o access token nas demais requests.
`setEnvVar` grava no arquivo do environment, que é **versionado** — o token do usuário demo acabaria
commitado em `api-collection/`. `bru.setVar` guarda em memória, só durante a execução (também o
caminho preferido no Bruno v4, que está descontinuando `setEnvVar` para esse uso).
