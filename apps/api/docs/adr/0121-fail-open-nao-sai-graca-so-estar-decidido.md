# O fail-open não sai de graça só por estar decidido (7.0)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Fail-open e o que a execução ensinou*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Ele depende de o client Redis **falhar rápido**. Com o default do ioredis, um comando emitido
enquanto o Redis está fora do ar fica na fila de offline esperando reconexão, e o login pendura
em vez de seguir: o fail-open viraria **fail-hang**. Por isso o client sobe com
`enableOfflineQueue: false` e `maxRetriesPerRequest: 1` (e os timeouts da 7.12 fecham o caso do
Redis que aceita a conexão e não responde). Verificado derrubando o container com a app no ar:
`/status` 200 e login 401, nunca 5xx.
