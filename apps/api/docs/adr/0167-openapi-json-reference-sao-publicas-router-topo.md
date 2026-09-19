# `/openapi.json` e `/reference` são públicas, no router de topo

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Documentação da API*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Documentação de API é para ser lida sem credencial; travá-la atrás de `authenticate` só atrapalharia.
Ficam no router de topo, antes dos grupos protegidos, fora de `/api/v1`. A UI Scalar consome o
`/openapi.json` e tem "try it" com Bearer preenchível — daí o `securitySchemes.bearerAuth` global no
documento, com as operações públicas sobrescrevendo `security: []`. O hardening da CSP dessa página
está em [`0130`](0130-auto-hospedar-bundle-scalar-vez-allowlistar-cdn.md).
