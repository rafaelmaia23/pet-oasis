# A checagem de lockout entra no ramo da senha CORRETA

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Colocá-la antes de verificar a senha bloquearia toda tentativa assim que o usuário trava, mas
romperia o espírito anti-enumeração dos gates de `bannedAt`/`status` (que só revelam o estado da
usuário depois de a senha bater). A leitura certa: o rate limit por IP/email-alvo já cobre o
**volume**; o papel do lockout é impedir que uma senha eventualmente certa — vinda de stuffing
distribuído — complete o login dentro da janela. O estado (`failures`/`backoffLevel`/
`lockedUntil`) fica só no Redis, e a transição (`applyFailure`) é função **pura** — mesmo idioma
de `computeEffectiveFeatures` —, testável por unidade sem tocar Redis.
