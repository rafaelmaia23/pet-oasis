# Demais recursos

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Views (presenter)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

- **Role**: id, name, description (obrigatória), appliesTo (`enum`, **não** nullable desde a Fase
  8), features `[{id,name,description}]` — junção achatada no service
  (`role.features.map(rf => rf.feature)`).
- **Feature**: id, name, description.
- **Breed**: id, name, species — view única (catálogo público, sem campo sensível).
- **Pet** (9.4): view **única** também, e por um motivo diferente do `Breed` — não há campo da
  ficha que o funcionário veja e o dono não. O que separa os dois é a autorização de **escopo**
  (`own` × `:others`), que decide *se* a ficha sai, não *quanto* dela. A raça sai achatada
  (`breed: {id,name} | null`) em vez de repassar a linha inteira da junção.
- **Permission**: `/features` = overrides crus `[{granted, grantedAt, updatedAt, role, feature}]`;
  `/permissions` = efetivas `string[]`.
- **Session** (`GET /auth/sessions`): id, createdAt, expiresAt, ipAddress, `device` e `current`. A
  view **não** expõe o `userAgent` cru — ele entra parseado por `describeUserAgent`
  (`src/lib/userAgent.ts`, função pura sobre `ua-parser-js`) como `"Chrome no Windows"`, com
  fallback `"Dispositivo desconhecido"`. `current` compara o hash do refresh token do cookie da
  própria request contra o `refreshTokenHash` de cada linha — sem cookie (acesso só com o access
  token), nenhuma sessão é marcada como atual.
