# pet-oasis — Contexto Detalhado (Ciclo 1)

> Referência de consulta. O essencial acionável está no `CLAUDE.md`; o estado das tarefas no `TODO.md`. Aqui ficam os detalhes longos: contratos de view, racional das decisões, gotchas técnicos aprendidos. Consulte quando precisar do "porquê" ou de um detalhe específico.

---

## 1. Contratos de view (presenter)

Cada recurso tem views resolvidas pela **capability do viewer** (não pelo role). `.parse()` derruba campos não listados → nada sensível vaza por omissão.

**User** — progressão por capability:
- `default` (id, name) → qualquer um vê de qualquer user
- `owner` (+ email, cpf, status, customer/employee aninhados nullable) → o próprio dono
- `me` (owner + features efetivas `string[]`) → o próprio, em `/me`
- `admin` (+ createdAt, updatedAt, roles `[{role:{id,name}}]`, features `[{granted,grantedAt,feature}]`) → quem tem `read:user:others`

cpf aparece em `owner` (dado próprio) e `admin` (gerente vê — normal em pet shop, vendas ligadas a cpf).

**Role**: id, name, description (obrigatória), appliesTo (`enum.nullable()`), features `[{id,name,description}]` — junção achatada no service (`role.features.map(rf => rf.feature)`).

**Feature**: id, name, description.

**Permission**: `/features` = overrides crus `[{granted, grantedAt, feature}]`; `/permissions` = efetivas `string[]`.

**Erros**: 422 VALIDATION_ERROR (`errors` por campo), 409 CONFLICT, 404 NOT_FOUND, 403 FORBIDDEN (action nomeia a feature exigida), 401 UNAUTHORIZED. DELETE de recurso = 204 (user) ou 200 com recurso atualizado (perfil — o user continua existindo).

---

## 2. Racional das decisões (o "porquê" longo)

**Por que presenter por whitelist e não blacklist:** listar o que PODE sair é à prova de futuro — um campo sensível novo no model não vaza por omissão (não está na view). Blacklist exigiria lembrar de excluir cada campo novo.

**Por que view por capability e não por role:** a feature `read:user:others` pode vir de role OU de override. Resolver por role perderia quem tem a capability por override. A capability é a verdade.

**Por que autorização antes da busca:** se buscasse primeiro, alguém sem `:others` saberia se um id existe (404) ou não (sem erro) — vaza existência. Checando `canActOnResource(user, feature, targetId)` antes (usando o id da URL como ownerId, sem query), quem não tem `:others` recebe 403 igual para id existente ou não.

**Por que P2002 no handler e não check antecipado:** o check `findByEmail` antes de criar tem corrida (entre o SELECT e o INSERT, outro request insere). O constraint `@unique` é a garantia real; traduzir o P2002 fecha a corrida e cobre todos os campos únicos de uma vez.

**Por que soft delete de UserFeature/UserRole (autorização, não histórico de negócio):** decidido POR auditoria de segurança — "quem podia o quê, quando". Sem isso, seria hard delete (autorização não costuma precisar de histórico). A escolha trocou a PK composta por `id` próprio (para permitir múltiplos registros do mesmo par: deletados + 1 ativo) e a unicidade do ativo passou a ser controlada por código.

**Por que não-escalação checa role admin (não a feature):** se checasse a feature `manage:permission`, ela mesma poderia ser concedida por override → escalação. A role admin é "dura" (vem de atribuição de role), por isso é a âncora. Um attendant com `manage:permission` emprestada não é admin → não mexe em PERMISSION_FEATURES.

**Por que a não-escalação foi generalizada para roles (não só overrides):** atribuir ou revogar uma ROLE pode conceder o mesmo poder que um override de feature — a role `admin` carrega o wildcard `"*"`, e `manager` já carrega as próprias `PERMISSION_FEATURES`. Sem essa checagem, um ator com `manage:permission` (mas sem a role `admin`) contornaria a proteção de overrides só atribuindo a role `admin`/`manager` a si mesmo ou a outro usuário — a mesma escalação, por uma porta diferente. `assertAdminForRoleAssignment` usa a mesma âncora (`role admin`, não a feature), mas o gatilho muda: dispara quando a role concedida/revogada carrega alguma `PERMISSION_FEATURES` OU o wildcard `"*"`. Vale tanto para conceder (POST) quanto para revogar (DELETE) — remover a role `admin` de alguém é tão sensível quanto concedê-la.

**Por que FeatureName/string boundary:** tipo estreito (union literal) descreve o que você SABE em compile-time — vale onde digita o literal. Dado do banco é `string` em runtime (o banco não conhece o union). Forçar o union além dessa fronteira gera `as` (mentira ao compilador). A fronteira é onde Zod valida.

**Por que perfis antes de user↔role:** atribuir role exige o perfil compatível já existir (a regra "sem perfil → crie primeiro, não silencioso"). Se user↔role viesse antes, dependeria de algo inexistente.

---

## 3. Schema — pontos de atenção

- **User**: id, name, cpf @unique, email @unique, passwordHash, createdAt, updatedAt, deletedAt?. Relações: employee?, customer?, roles[], features[], sessions[].
- **Customer/Employee**: id, userId @unique, deletedAt?, campos próprios (Customer: phone obrigatório, address?, birthDate?; Employee: hiringDate @default(now())). `onDelete: Cascade` no user.
- **UserRole/UserFeature**: `id @id @default(uuid())` (NÃO par composto — mudou para soft delete), deletedAt?. UserFeature: granted, grantedAt @default(now()), updatedAt @updatedAt.
- **Role**: code-seeded, description obrigatória, appliesTo (ProfileKind?). **Feature**: code-seeded.
- Unicidade de override/role ativo: garantida por código (busca ativo → update/create), não por constraint SQL.

**Roles** (em `role.constants.ts`): customer (CUSTOMER), attendant/manager/admin (EMPLOYEE). admin tem `["*"]`. Compostas por grupos semânticos (SELF_MANAGEMENT, USER_ADMINISTRATION, PERMISSION_FEATURES) deduplicados via `[...new Set()]`. `DEFAULT_ROLES as const satisfies readonly RoleDefinition[]`.

**PERMISSION_FEATURES**: read:feature, read:role, read:permission, manage:permission.


---

## 4. Histórico de versões deste contexto
Esta versão consolida o ciclo 1 até o ponto: CRUD de user, soft delete (user/perfil/override/role), módulos role e permission, POSTs de perfil completos, DELETEs de perfil completos (customer e employee) — inclusive remoção seletiva de roles por `appliesTo`, transação atômica, e recusa de deleção do último perfil ativo. Feature `delete:profile` adicionada a `USER_ADMINISTRATION_FEATURES`. Vínculo user↔role completo (`GET`/`POST`/`DELETE` em `/api/v1/users/:userId/roles`), com `toRoleDTO` centralizando o shape de resposta (extraído de `role.service.ts`, reusado em `/roles` e `/users/:userId/roles`) e não-escalação generalizada (`assertAdminForRoleAssignment`) cobrindo atribuição e revogação de roles privilegiadas.
