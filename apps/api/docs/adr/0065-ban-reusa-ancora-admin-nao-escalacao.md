# Ban reusa a âncora admin da não-escalação

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Ban — a conta congelada*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Banir/desbanir usa `manage:user:status` (em `USER_ADMINISTRATION_FEATURES`, logo manager e admin a
têm), mas banir/desbanir um alvo **privilegiado** exige role **admin** — sem isso um manager
neutralizaria um admin banindo-o (escalação lateral). Ban também invalida as sessões do alvo no
ato: um banido não deve seguir usando o access token até expirar.
