# Isolamento de teste do Redis é por arquivo, não global

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Fail-open e o que a execução ensinou*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Contador de rate limit vaza entre testes, então todo arquivo de integração que autentica chama
`flushRedis()` (`tests/helpers/redis.ts`) no próprio `afterEach`. Fazer isso num `setupFile`
global falhou de um jeito não-óbvio: o `afterEach` global corria antes de a conexão real do
ioredis terminar o handshake nos testes **unitários** (rápidos, na casa dos ms) e os derrubava com
erro de `enableOfflineQueue`. Escopado por arquivo, fica no mesmo idioma explícito do
`clearDatabase()` que a suíte já usa.
