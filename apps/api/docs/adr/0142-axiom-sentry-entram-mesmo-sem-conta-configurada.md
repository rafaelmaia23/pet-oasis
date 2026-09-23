# Axiom e Sentry entram mesmo sem conta configurada

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *Destinos*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Ambos ativam só se as env vars existirem; ausentes, a app degrada para stdout + ring buffer e
**boota normalmente**. O subsistema de log nunca pode derrubar a aplicação — nem no boot, nem no
request. Por isso o Axiom vai em **worker thread**, fora do caminho síncrono, com `flush` no
shutdown: senão os últimos logs antes do SIGTERM se perdem justamente quando mais importam.

No Sentry, só falha de verdade é capturada (≥500, não-tratado, `unhandledRejection`,
`uncaughtException`): um 404 ou 422 é comportamento correto da API, não incidente. E o `beforeSend`
replica a lista de campos proibidos do `redact` — reusando as constantes exportadas de `logger.ts`,
para não existir uma segunda lista que diverge —, senão o Sentry vazaria pela porta dos fundos o
que a política protege na porta da frente.

**Gotcha do empacotamento:** o `release` do Sentry lê a versão do `package.json` via
**`process.cwd()`**, não por caminho relativo ao módulo — o tsup achata `src/lib/sentry.ts` dentro
de um `dist/server.js` só, e o cwd é a única referência estável entre dev, teste e produção.
