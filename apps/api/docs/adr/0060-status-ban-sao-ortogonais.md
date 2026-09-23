# Status e ban são ortogonais

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Status da conta*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`enum PENDING/ACTIVE` + `bannedAt`, não `enum PENDING/ACTIVE/BANNED`. Um único enum obrigaria banir
a sobrescrever `PENDING`/`ACTIVE`, e desbanir teria que adivinhar para onde voltar (um `PENDING`
banido volta pra quê?). Ban como timestamp-flag separado (`bannedAt`/`bannedBy`/`banReason`) —
mesmo idioma de `deletedAt`/`usedAt`/`invalidatedAt` — mantém o `status` de verificação intacto
durante o ban: desbanir é limpar as três colunas e o usuário volta exatamente ao estado anterior. A
regra de login vira conjunção explícita: `status == ACTIVE && bannedAt == null`.
