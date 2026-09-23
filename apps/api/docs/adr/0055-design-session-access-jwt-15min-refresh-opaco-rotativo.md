# Design de `Session` — access JWT 15min + refresh opaco rotativo

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Sessão e refresh*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Cada linha de `Session` representa **um token de refresh emitido**, não uma "sessão" no sentido
de família de dispositivo — não existe id de família agregando rotações sucessivas do mesmo
login. Um login cria uma linha; cada rotação bem-sucedida em `/refresh` marca a antiga com
`usedAt` e cria uma nova (mesmo `userId`, hash novo).

Três campos, três formas independentes de uma sessão morrer:

- `usedAt` — já foi trocada por uma rotação; reuso dela é sinal de roubo
- `invalidatedAt` — revogada explicitamente (logout, revogação pontual, resposta a roubo)
- `expiresAt` — TTL de 7 dias, deslizante a cada rotação

"Sessão viva" = as três condições simultaneamente
(`usedAt IS NULL AND invalidatedAt IS NULL AND expiresAt > now()`) — é o filtro de
`findLiveSessionsByUserId`, base de `GET /auth/sessions` e de `revokeSession`, que trata "não
encontrada" e "encontrada mas morta" com o **mesmo 404 genérico**, sem vazar qual dos dois
aconteceu.
