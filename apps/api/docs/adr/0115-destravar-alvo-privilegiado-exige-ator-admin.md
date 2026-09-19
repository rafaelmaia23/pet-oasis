# Destravar alvo privilegiado exige ator admin

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Destravar não concede privilégio novo, mas **remove uma proteção** sobre o usuário-alvo. Um
manager comprometido poderia destravar um usuário admin no meio de um ataque de força bruta,
anulando o lockout bem na hora em que ele mais protege — mesmo raciocínio de escalação lateral
de `assertAdminForBan`. Ver [índice de ADRs](README.md#não-escalação).
