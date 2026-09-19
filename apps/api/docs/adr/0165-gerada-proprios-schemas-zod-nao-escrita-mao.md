# Gerada dos próprios schemas Zod, não escrita à mão

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Documentação da API*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O contrato já vive nos `*.schema.ts` (request) e `*.presenter.ts` (response). Escrever um OpenAPI
paralelo à mão criaria duas fontes que divergem no primeiro refactor. Com o
`.meta({ description, example })` **nativo do Zod 4** (sem monkey-patch, sem `zod-to-openapi`
patchando o protótipo), cada schema carrega a própria doc e o `createDocument` (`zod-openapi`) monta
o `/openapi.json`. O envelope `{ body, params, query }` que os controllers já usam é extraído por
`.shape.*` num helper (`fromEnvelope`), com guarda de presença.
