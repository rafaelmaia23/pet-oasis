# Usuário demo isento do lockout (8.8)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Bug de produção descoberto pós-deploy da Fase 7: como a senha do demo é **pública**, o lockout
por usuário (que ignora origem) vira um DoS contra a própria porta de entrada do projeto — ao
contrário do rate limit por IP, que continua valendo. Isenção identificada pela **role `demo`**,
não por email, sem custo de query extra (`findUserByEmail` já traz `roles` no mesmo fetch do
`login()`). O critério é simples de propósito (K28): basta ter a role, aceitando que conceder
`demo` a um usuário real o isentaria também. Alternativa descartada (demo-reset limpando
`lockout:*`) no ADR.
