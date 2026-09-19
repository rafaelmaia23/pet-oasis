# User — progressão por capability

> Decisão migrada em 2026-09-18 do contexto temático da API (**Contratos de API** › *Views (presenter)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

- `default` (id, name) → qualquer um vê de qualquer user
- `owner` (+ email, pendingEmail, cpf, customer/employee aninhados nullable) → o próprio dono
- `me` (owner + features efetivas `string[]`) → o próprio, em `/me`
- `admin` (+ createdAt, updatedAt, roles `[{role:{id,name}, features:[{granted,grantedAt,feature}]}]`)
  → quem tem `read:user:others`. Desde a 8.0 os overrides moram **dentro** da atribuição de role,
  não num `features` no topo — a view espelha a junção para não perder a qual atribuição cada
  ajuste pertence.

`cpf` aparece em `owner` (dado próprio) e `admin` (gerente vê — normal em pet shop, vendas ligadas
a cpf).
