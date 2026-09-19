# Reset e change invalidam TODAS as sessões

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Senha*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Trocar a senha é o ponto natural de "expulsar quem não deveria estar". Se a senha vazou, invalidar
tudo (reusa `invalidateAllUserSessions`) corta o invasor imediatamente, em vez de esperar o refresh
expirar (7 dias). Vale para reset (não logado) e change (logado — o próprio usuário reloga; atrito
aceito pela garantia).
