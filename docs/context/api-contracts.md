# Contratos de API — views, erros, validação e paginação

> O que a API promete ao cliente. As rotas em si estão em
> [`reference/endpoints.md`](../reference/endpoints.md); o contrato formal é o
> `/openapi.json`, gerado dos próprios schemas Zod.

---

## Views (presenter)

Cada recurso tem views resolvidas pela **capability do viewer** (não pelo role). `.parse()`
derruba campos não listados → nada sensível vaza por omissão.

### Whitelist e não blacklist

Listar o que **pode** sair é à prova de futuro: um campo sensível novo no model não vaza por
omissão, porque não está na view. Blacklist exigiria lembrar de excluir cada campo novo.

### Por capability, não por role

A feature `read:user:others` pode vir de role **ou** de override. Resolver por role perderia quem
tem a capability por override. A capability é a verdade.

### User — progressão por capability

- `default` (id, name) → qualquer um vê de qualquer user
- `owner` (+ email, pendingEmail, cpf, customer/employee aninhados nullable) → o próprio dono
- `me` (owner + features efetivas `string[]`) → o próprio, em `/me`
- `admin` (+ createdAt, updatedAt, roles `[{role:{id,name}, features:[{granted,grantedAt,feature}]}]`)
  → quem tem `read:user:others`. Desde a 8.0 os overrides moram **dentro** da atribuição de role,
  não num `features` no topo — a view espelha a junção para não perder a qual atribuição cada
  ajuste pertence.

`cpf` aparece em `owner` (dado próprio) e `admin` (gerente vê — normal em pet shop, vendas ligadas
a cpf).

### Demais recursos

- **Role**: id, name, description (obrigatória), appliesTo (`enum`, **não** nullable desde a Fase
  8), features `[{id,name,description}]` — junção achatada no service
  (`role.features.map(rf => rf.feature)`).
- **Feature**: id, name, description.
- **Permission**: `/features` = overrides crus `[{granted, grantedAt, updatedAt, role, feature}]`;
  `/permissions` = efetivas `string[]`.
- **Session** (`GET /auth/sessions`): id, createdAt, expiresAt, ipAddress, `device` e `current`. A
  view **não** expõe o `userAgent` cru — ele entra parseado por `describeUserAgent`
  (`src/lib/userAgent.ts`, função pura sobre `ua-parser-js`) como `"Chrome no Windows"`, com
  fallback `"Dispositivo desconhecido"`. `current` compara o hash do refresh token do cookie da
  própria request contra o `refreshTokenHash` de cada linha — sem cookie (acesso só com o access
  token), nenhuma sessão é marcada como atual.

### `GET /me`

Exige a feature `read:user` (mesmo padrão de `GET /users/:id`); perfil soft-deletado aparece como
`null` (não sobe perfil morto); roles aninhadas dentro de `customer`/`employee` em shape enxuto
(`{id,name,description,appliesTo}`, sem features aninhadas — as capacidades já estão cobertas pelo
`features` efetivo do topo).

---

## Erros

422 VALIDATION_ERROR (`errors` por campo), 409 CONFLICT, 404 NOT_FOUND, 403 FORBIDDEN (`action`
nomeia a feature exigida), 401 UNAUTHORIZED. DELETE de recurso = 204 — tanto user quanto perfil; no
perfil o user continua existindo, só o `Customer`/`Employee` é soft-deletado.

### P2002 no handler, não check antecipado

O check `findByEmail` antes de criar tem corrida: entre o SELECT e o INSERT, outro request insere. O
constraint `@unique` é a garantia real; traduzir o P2002 fecha a corrida e cobre todos os campos
únicos de uma vez.

### Validação sintática × semântica

Sintática (Zod, sem banco) no controller; semântica (precisa de banco — `appliesTo`, etc.) no
service. Ambas produzem 422 no mesmo shape.

---

## Paginação

### Duas estratégias, um envelope só

**Offset** para listas de CRUD (com `total` e salto para página arbitrária) e **cursor/keyset** para
listas append-only ordenadas por tempo, onde offset pula e repete registros sob escrita concorrente.
Naturezas diferentes, ferramentas diferentes — mas **todas** as listagens devolvem `{ data, meta }`,
inclusive as que não paginam, para o cliente ter contrato único e para paginar uma delas amanhã ser
aditivo em vez de breaking.

Exceção: `GET /users/:userId/permissions` segue `string[]` cru (é um conjunto de capacidades
computado, não uma coleção de recursos).

O **tiebreaker por `id`** na chave do cursor é obrigatório: sem ele, dois registros com o mesmo
timestamp fazem a borda da página pular ou repetir. Limites e alternativas no ADR
[`pagination.md`](../adr/pagination.md).

---

## Tipos

### A fronteira `FeatureName` × `string`

Tipo estreito (union literal) descreve o que você **sabe** em compile-time — vale onde se digita o
literal. Dado do banco é `string` em runtime (o banco não conhece o union). Forçar o union além
dessa fronteira gera `as`, que é mentira ao compilador. A fronteira é onde o Zod valida.
