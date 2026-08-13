# Schema — pontos de atenção

> **Não é a listagem das colunas** — essa é o `prisma/schema.prisma`, e ele é a fonte de verdade.
> Aqui fica o que não se lê no schema: por que uma coluna é do jeito que é, o que uma migration
> mudou e qual invariante depende disso. O *porquê* longo está nos arquivos temáticos linkados.

---

## Modelos do núcleo

- **User** — id, name, cpf @unique, email @unique, passwordHash, createdAt, updatedAt,
  deletedAt?. Relações: employee?, customer?, roles[], sessions[]. `User.features` **deixou de
  existir** como relação na 8.0: overrides são alcançados por `User.roles[].features[]`.
- **Session** — id, userId, refreshTokenHash @unique, usedAt?, invalidatedAt?, expiresAt,
  userAgent?, ipAddress?, createdAt. **Sem campo `token`** (design antigo, validado no banco a cada
  request): o access token é um JWT stateless, validado só localmente por assinatura + expiração;
  só o refresh (opaco, hash salvo) toca essa tabela, e só em `/refresh`, `/logout` e nos endpoints
  de sessão. Ver
  [identity-and-sessions.md](identity-and-sessions.md#design-de-session--access-jwt-15min--refresh-opaco-rotativo).
- **Customer/Employee** — id, userId @unique, deletedAt?, campos próprios (Customer: `phone`
  obrigatório, address?, birthDate?; Employee: `hiringDate @default(now())`). `onDelete: Cascade`
  no user.
- **UserRole/UserFeature** — `id @id @default(uuid())`, **não** par composto: mudou por causa do
  soft delete, que exige N linhas mortas + 1 viva do mesmo par. `deletedAt?` nas duas. UserFeature:
  `granted`, `grantedAt @default(now())`, `updatedAt @updatedAt`. Ver
  [lifecycle.md](lifecycle.md#por-que-userfeatureuserrole-também-têm-soft-delete).
- **Role** — code-seeded, `description` obrigatória, `appliesTo ProfileKind` **NOT NULL** desde o
  Passo 0 da Sessão B da Fase 8 (o catálogo nunca produziu `null`, e três branches mortos
  sustentavam esse estado). **Feature** — code-seeded.
- **AuditLog** — `id`, `action`, `actorId?`, `targetType`, `targetId?`, `metadata`, `ip?`,
  `userAgent?`, `createdAt`. `actorId`/`targetId` são **uuid cru, sem FK**: evidência precisa
  continuar apontando para linha soft-deletada, mesmo idioma do `User.bannedBy`. Índices:
  `(createdAt, id)` (a chave do cursor de `GET /audit-logs`), `action`, `actorId`, `targetId`.
  Append-only — a aplicação nunca faz update/delete; só o script de retenção apaga.

## Constantes de domínio

**Roles** (`role.constants.ts`): `customer` (CUSTOMER), `attendant`/`manager`/`admin` (EMPLOYEE),
`demo` (EMPLOYEE, só leitura). `admin` tem `["*"]`. Compostas por grupos semânticos
(`SELF_MANAGEMENT`, `USER_ADMINISTRATION`, `PERMISSION_FEATURES`) deduplicados via
`[...new Set()]`. `DEFAULT_ROLES as const satisfies readonly RoleDefinition[]`.

**PERMISSION_FEATURES**: `read:feature`, `read:role`, `read:permission`, `manage:permission`.
**PRIVILEGED_FEATURES** = essas quatro **+ `read:audit-log:full`**.

---

## O que cada fase mudou nas tabelas

### Fase 4 — status de conta

`User` ganhou `status UserStatus @default(PENDING)` (`enum UserStatus { PENDING, ACTIVE }`) +
`bannedAt?`/`bannedBy?`/`banReason?` — ban **ortogonal** ao status. Model `VerificationToken`
(id, userId, tokenHash @unique, purpose, expiresAt, usedAt?, createdAt, `onDelete: Cascade`) +
`enum VerificationPurpose { EMAIL_VERIFICATION, PASSWORD_RESET }`, mesmo padrão hash-do-token da
`Session`. Feature `manage:user:status` em `USER_ADMINISTRATION_FEATURES`. `clearDatabase` passou a
limpar `verificationToken` antes de `user`. Migration aplicada com backfill `status='ACTIVE'` para
as linhas pré-existentes.

### Fase 7

- **7.6** — model `AuditLog` (acima).
- **7.15** (`add_email_change_and_previous_emails`) — `VerificationPurpose` ganhou `EMAIL_CHANGE`;
  `VerificationToken` ganhou `newEmail String?` (coluna de um purpose só — o token carrega o próprio
  alvo); `User` ganhou `pendingEmail String? @map("pending_email")`, **não-único**; tabela nova
  `PreviousEmail` (`id`, `userId` FK, `email`, `replacedAt`, `createdAt`, `@@index([userId])`).
- **7.16** (`add_must_change_password`) — `User.mustChangePassword Boolean @default(false)`.

### Fase 8

- **8.0** — `UserFeature.userId` → **`userRoleId`** (FK para `UserRole`, `onDelete: Cascade`) +
  `@@unique([userRoleId, featureId])`; `UserRole` ganhou `grantedAt` e `@@unique([userId, roleId])`.
  A unicidade do ativo saiu do código e foi para o banco. A migration **zerou o banco** (D10): o
  único ambiente no ar era o demo de portfólio, sem dado real a preservar, o que permitiu trocar o
  dono do override sem backfill nem migration em duas etapas.
- **8.4** — `VerificationPurpose` ganhou `ACCOUNT_REACTIVATION`; `VerificationToken` ganhou
  `restoreProfiles ProfileKind[]` e `restoreRoleIds String[]` (colunas de um purpose só, idioma do
  `newEmail` da 7.15). `restoreRoleIds` **vazio significa o default do D8** — todas as roles que
  morreram na cascata.
- **8.6** — o `@unique` de `PreviousEmail.email` **saiu** (migration de uma linha); o
  `@@index([userId])` ficou. A tabela continua existindo como histórico.

---

## Invariantes que o schema não expressa sozinho

- **Nenhuma coluna de "motivo de deleção" existe.** A correlação da restauração é o próprio
  `deletedAt` (D4/D5) — ver [lifecycle.md](lifecycle.md#correlação-por-data-não-por-coluna-de-motivo-d5).
- **Um único `new Date()` por transação de cascata**, propagado por parâmetro. Se vazar, o bug é
  silencioso: só a restauração deixa de achar os filhos.
- **Toda query de leitura filtra `deletedAt: null`**, inclusive `getUserForFeatureComputation` — é
  o que mata o token de usuário deletado e ignora overrides removidos.
- **Valores monetários em inteiro-centavos, peso em inteiro-gramas** — nunca `Decimal`/float
  (Fase 9). Ver [pet-domain.md](pet-domain.md#catálogo--adrproduct-catalog-modelingmd).
