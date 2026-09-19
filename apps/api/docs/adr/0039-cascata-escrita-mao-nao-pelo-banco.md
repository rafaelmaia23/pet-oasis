# A cascata é escrita à mão, não pelo banco

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Soft delete*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`onDelete: Cascade` é ação referencial de *hard delete*: dispara no `DELETE` físico da linha
pai. Aqui o pai não é apagado (`UPDATE users SET deleted_at = ...`), e FK não propaga UPDATE de
coluna comum. O nativo seria **trigger**, recusada porque o Prisma não a gerencia (SQL cru numa
migration, fora do typecheck e dos testes) e porque não devolve as contagens que o audit
precisa. Nested write cobre parte (`roles: { updateMany: ... }`), mas `updateMany` só aceita
`where` + `data`: não desce até o **neto** (`UserFeature` via `UserRole`).
