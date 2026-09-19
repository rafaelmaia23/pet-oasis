# O `demo` enxerga o domínio novo, menos o custo

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Roles de funcionário*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Sem features novas, a credencial pública do demo responderia 403 justamente nas rotas mais
vistosas da Fase 9. Ela recebeu `read:pet:others` e `read:product:internal`, e **não**
`read:product:cost` — o mesmo desenho de `read:audit-log` sem `read:audit-log:full`: o visitante
vê o recurso e vê o campo sensível ausente, então o RBAC se demonstra dentro do próprio payload.
Nenhuma feature de escrita, garantido por teste que varre os verbos de escrita da role.
