# A allowlist de CORS sai só da variável explícita — a `APP_URL` não entra por inércia (10.11)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Na Fase 7 a allowlist nasceu como `[APP_URL, ...CORS_ALLOWED_ORIGINS]`: a URL pública do cliente
entrava sozinha, por ser presumidamente quem chama por navegador. A Fase 10 desfez isso. Depois
da migração de domínio a `APP_URL` é o front, e o front adota BFF — quem fala com a API é o
servidor dele, e a requisição chega **sem `Origin`**. A entrada automática viraria permissão
concedida a um consumidor que não existe, e permissão que ninguém pediu é permissão que ninguém
revisa. Hoje `src/config/cors.ts` monta a lista **só** de `CORS_ALLOWED_ORIGINS`, e a lista vazia é o
estado esperado enquanto o único cliente for o front com BFF. O middleware e a variável ficam para o dia em que houver uma página web de outra
origem chamando a API direto do JavaScript — esse é o único cliente que precisa de CORS. App
mobile nativo **não** é motivo para reabrir a allowlist: não há navegador, não há preflight. A
tabela de quem precisa e quem não precisa está em
[`guides/integrating-with-the-api.md`](../guides/integrating-with-the-api.md#3-cors-quando-se-aplica-e-quando-não).
A `APP_URL` continua existindo, mas só para o que sempre foi dela: os links dos emails.
