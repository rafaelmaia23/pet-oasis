# Senha atual errada no change é 403, não 401

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Senha*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A request já está autenticada (Bearer válido) — um 401 seria lido pelo front como "token expirou" e
dispararia refresh/logout indevido. O que falhou foi a prova da senha atual (re-autenticação para
ação sensível), semanticamente 403. Contraste: no login, senha errada é 401 porque ainda não há
identidade estabelecida.
