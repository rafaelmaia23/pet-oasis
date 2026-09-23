# O guard vale para roles, não só para overrides

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Não-escalação*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Atribuir ou revogar uma **role** pode conceder o mesmo poder que um override: `admin` carrega
o wildcard `"*"` e `manager` já carrega as próprias `PERMISSION_FEATURES`. Sem essa checagem,
um ator com `manage:permission` (sem a role `admin`) contornaria a proteção de overrides só
atribuindo `admin`/`manager` a si mesmo ou a outro. `assertAdminForRoleAssignment` usa a mesma
âncora, mas o gatilho muda: dispara quando a role concedida/revogada carrega alguma
`PERMISSION_FEATURES` **ou** o wildcard. Vale para conceder (POST) **e** revogar (DELETE) —
tirar a role `admin` de alguém é tão sensível quanto dá-la.
