# Configuração: duas env vars por regra, não uma string composta

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O ADR listava um nome só por regra (`RATE_LIMIT_LOGIN`, default "20 / 15 min"), mas o D8 exige a
janela configurável — e não existe no projeto parser para "contagem/janela" num valor só (ao
contrário de `JSON_BODY_LIMIT`, que reusa a lib `bytes`). Duas vars (`_MAX` + `_WINDOW_MS`),
mesmo idioma do `LOCKOUT_THRESHOLD`/`_WINDOW_MS`/`_MAX_MS` que o ADR já separava.
