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

**Erros**: 422 VALIDATION_ERROR (`errors` por campo), 409 CONFLICT, 404 NOT_FOUND, 403 FORBIDDEN (action nomeia a feature exigida), 401 UNAUTHORIZED. DELETE de recurso = 204 (tanto user quanto perfil — no perfil o user continua existindo, só o Customer/Employee é soft-deletado).

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

**Por que `authenticate` saiu do `app.ts` (global) e foi para `routes/index.ts` (por grupo de rota):** rotas públicas de autenticação (`/auth/login`, `/auth/signup`, `/auth/refresh`) não podem depender de já estar autenticado — em especial `/auth/refresh`, cujo propósito é justamente recuperar acesso quando o access token expirou; com `authenticate` global, um Bearer expirado nesse header derrubava a requisição com 401 antes de chegar na rota, mesmo sem `canAccess`. A correção aplica `authenticate` só nos grupos protegidos (`/me`, `/users`, `/users/:userId`, `/features`, `/roles`), deixando `/status` e `/auth` de fora — de propósito, não por omissão. `logout`, `GET /auth/sessions` e `DELETE /auth/sessions/:id` são protegidos mas vivem dentro do `/auth` público, então cada uma aplica `authenticate`+`canAccess` diretamente na própria definição de rota (`auth.routes.ts`), não no grupo inteiro — já implementado, não é mais trabalho futuro.

**Design de `Session` (Fase 3 — access JWT + refresh opaco rotativo):** cada linha de `Session` representa um token de refresh emitido, não uma "sessão" no sentido de família de dispositivo — não existe um id de família separado agregando rotações sucessivas do mesmo login. Um login cria uma linha; cada rotação bem-sucedida em `/refresh` marca a linha antiga com `usedAt` e cria uma linha nova (mesmo `userId`, hash novo). Três campos, três formas independentes de uma sessão "morrer": `usedAt` (já foi trocada por uma rotação — reuso dela é sinal de roubo), `invalidatedAt` (revogada explicitamente — logout, revogação pontual, ou resposta a roubo), `expiresAt` (TTL de 7 dias, deslizante a cada rotação). "Sessão viva" = as três condições simultaneamente (`usedAt IS NULL AND invalidatedAt IS NULL AND expiresAt > now()`) — é o filtro usado em `findLiveSessionsByUserId` (base de `GET /auth/sessions` e de `revokeSession`/`DELETE /auth/sessions/:id`, que trata "não encontrada" e "encontrada mas morta" com o mesmo 404 genérico, não vazando qual dos dois aconteceu).

**Ordem de checagem no `refresh`:** reuso (`usedAt` setado) → invalidada → expirada, sempre a mesma mensagem 401 genérica em qualquer uma das três (não revela qual checagem falhou). A ordem importa: `usedAt` é checado primeiro porque é o único caso que dispara efeito colateral — replay de um token já usado aciona `invalidateAllUserSessions(userId)`, matando TODAS as sessões do usuário (não só a reutilizada), já que reuso é o sinal mais forte de que o refresh token vazou e o dispositivo legítimo não é mais o único de posse dele. Nota de consistência: `invalidateAllUserSessions` (resposta a roubo) e `softDeleteUserAndInvalidateSessions` (usuário deletado) usam critérios de `where` diferentes de propósito — a primeira invalida por `invalidatedAt: null, expiresAt: { gt: now }` (sem excluir `usedAt`), porque numa resposta a roubo o objetivo é marcar `invalidatedAt` em TODA sessão do usuário para auditoria completa, inclusive as já usadas; a segunda já inclui `usedAt: null` porque o objetivo ali é só limpar sessões que ainda poderiam ser usadas — não é uma resposta a incidente, é encerramento de conta.

**Roles default na criação de usuário:** employee nasce com `attendant`, customer com `customer` (`DEFAULT_EMPLOYEE_ROLES`/`DEFAULT_CUSTOMER_ROLES` em `user.service.ts`). Criar sem `roleNames` usa o default; passar `roleNames` valida `appliesTo` via `validateRoles` (incompatível → 422 com `errors`).

**POST de perfil — 409 distinto para ativo vs inativo:** criar `/customer`|`/employee` num user que já tem aquele perfil **ativo** → 409 "já possui"; que tem o perfil **soft-deletado** → 409 com mensagem distinta (não reativa — sem recovery no ciclo 1, coerente com a regra de soft delete do `CLAUDE.md`). Os dois casos são conflito, mas a mensagem diferencia pra não confundir "já existe" com "existe mas está preso".

**DELETE de override (feature) → 404 quando não há override ativo:** decidido avisar (404) em vez de 204 silencioso — o caller pediu para remover algo que não existe, então é informado, não enganado com um sucesso vazio. (`assertAdminForPermissionFeature` reusado tanto no PUT quanto no DELETE.)

**user↔role POST — orienta, não cria perfil:** se `role.appliesTo` é incompatível com os perfis ativos do user → **422** cujo `action` orienta criar o perfil primeiro; o endpoint **não** cria o perfil automaticamente (efeito colateral silencioso é pior que um erro claro). Se o user já tem a role ativa → **409** (idempotência). Casa com "perfis antes de user↔role" acima.

**user↔role DELETE — protege o último vínculo do perfil:** se remover a role deixaria o perfil correspondente (customer/employee) sem nenhuma role ativa → **409**, com `action` apontando pro DELETE do perfil (a via correta de encerrar o perfil inteiro). Impede um user ficar com um perfil "órfão" sem role.

**GET /me:** exige a feature `read:user` (mesmo padrão de `GET /users/:id`); perfil soft-deletado aparece como `null` (não sobe perfil morto); roles aninhadas dentro de `customer`/`employee` em shape enxuto (`{id,name,description,appliesTo}`, sem features aninhadas — as capacidades já estão cobertas pelo `features` efetivo do topo).

---

## 2.1 Fase 4 (planejada) — decisões e racional

> Decisões firmadas no planejamento da Fase 4 (status de conta, verificação de email, email genérico, troca/recuperação de senha, banimento). O passo-a-passo atômico está no `TODO.md` (seção "Fase 4"). Estas são as regras de negócio e o "porquê" de cada uma.

**Por que status e ban são ortogonais (`enum PENDING/ACTIVE` + `bannedAt`, não `enum PENDING/ACTIVE/BANNED`):** um único enum obrigaria banir a sobrescrever `PENDING`/`ACTIVE`, e desbanir teria que "adivinhar" para onde voltar (um `PENDING` banido volta pra quê?). Modelar ban como timestamp-flag separado (`bannedAt`/`bannedBy`/`banReason`) — mesmo idioma de `deletedAt`/`usedAt`/`invalidatedAt` já usado no projeto — mantém o `status` de verificação intacto durante o ban: desbanir é só limpar as três colunas e a conta volta exatamente ao estado anterior. A regra de login vira uma conjunção explícita: `status == ACTIVE && bannedAt == null`.

**Por que todo usuário nasce PENDING (inclusive os criados por admin):** o objetivo da verificação é provar que o email é válido e pertence à pessoa (recebe recados). Isso vale igual para o funcionário criado por um admin — o email dele também precisa ser verificado. Uma regra única ("todo mundo verifica") evita um `status` condicional por origem de criação e não abre exceção que depois vira dívida. O custo é um passo de verificação para contas internas — aceito.

**Por que verificação/reset/forgot ficam sob `/auth` e não têm feature:** são operações de autenticação self-service, no mesmo grupo público de `login`/`signup`/`refresh` — quem as usa por definição ainda não está autenticado (ou está agindo sobre a própria identidade). O recurso central de cada uma é o **token** (verificação, reset), não um recurso de domínio, por isso `POST /auth/verify-email`, `/forgot-password`, `/reset-password` em vez de aninhar em `/users/:id`. `change-password` é a exceção autenticada: exige `authenticate` mas nenhuma feature, porque é o dono agindo na própria conta, travado pela senha atual.

**Por que 403 (e não 401) no login quando a senha está certa mas a conta não está ACTIVE:** senha errada é 401 genérico (não se sabe quem é). Já uma credencial correta estabelece a identidade — o que falta é permissão de entrar (conta não verificada ou suspensa), que é semanticamente 403. Mensagens distintas (PENDING → "verifique seu email"; BANNED → "conta suspensa, contate o suporte") orientam o dono. Trade-off aceito: o 403 revela que a senha estava correta, mas quem chegou até aqui provou posse da senha, então é o próprio dono.

**Por que anti-enumeração em forgot/resend/signup:** `forgot-password` e `verify-email/resend` respondem **sempre 200 genérico** independentemente de o email existir/estar ACTIVE/estar banido — senão a resposta viraria um oráculo de "quais emails têm conta". O email real só é disparado quando a condição interna é satisfeita. No mesmo espírito, signup com email de um banido mantém o **409 genérico** já produzido pelo `@unique` (a linha do banido persiste, não é deletada), sem mensagem especial "banido".

**Por que reset e change-password invalidam TODAS as sessões:** trocar a senha é o ponto natural de "expulsar quem não deveria estar". Se a senha vazou, invalidar todas as sessões (reusa `invalidateAllUserSessions`) corta o invasor imediatamente, em vez de esperar o refresh expirar (7 dias). Vale para reset (não logado) e change (logado — o próprio usuário reloga; atrito aceito pela garantia de segurança).

**Por que change-password é single-step e sem código por email:** o usuário já está logado; exigir a senha atual já protege contra sessão sequestrada (um invasor com o access token não sabe a senha). Um segundo fator por email para um usuário logado seria mais atrito do que segurança neste momento — descartado. (Contraste: reset, para usuário NÃO logado, precisa do token por email porque não há outra prova de identidade.)

**Por que ban reusa a âncora admin da não-escalação:** banir/desbanir usa a feature `manage:user:status` (em `USER_ADMINISTRATION_FEATURES`, logo manager e admin a têm), mas banir/desbanir um alvo **privilegiado** (role com `PERMISSION_FEATURES` ou wildcard `*`) exige role **admin** — mesma lógica de `assertAdminForRoleAssignment`. Sem isso, um manager poderia neutralizar um admin banindo-o (escalação lateral). Ban também invalida as sessões do alvo no ato: um banido não deve continuar usando o access token até expirar.

**Por que "conta congelada":** banido não faz **nada** com a conta — login bloqueado (403 suporte), forgot/reset e resend-verification viram no-op (200 genérico, nenhum email sai), sessões vivas derrubadas. O ban é um estado terminal (reversível só por desban de um admin), não um "login negado" isolado.

**Por que um `VerificationToken` genérico (com `purpose` enum) e não models separados por finalidade:** email-verification e password-reset compartilham exatamente a mesma forma (token opaco, hash SHA-256 salvo, `expiresAt`, `usedAt`, `userId`) — a única diferença é a finalidade e o TTL. Um model com `purpose (EMAIL_VERIFICATION|PASSWORD_RESET)` evita dois repositórios quase idênticos. Reusa `hashToken` de `src/lib/token.ts` (mesmo padrão do refresh: guarda só o hash, entrega o token cru ao usuário). `change-password` não usa esse model (não há token — a prova é a senha atual).

**Por que serviço de email genérico:** o `send({to,subject,html,text})` em `src/lib/email.ts` não sabe de verificação/reset — recebe o email pronto. Isso o deixa reusável para o que vem depois (lembretes de agendamento, confirmações de serviço/venda). Transporter configurado por `env` (dev aponta pro mailpit no docker; produção usa credenciais SMTP do Resend com `secure: true`). Falha de envio → `createServiceUnavailableError` (503).

---

## 3. Schema — pontos de atenção

- **User**: id, name, cpf @unique, email @unique, passwordHash, createdAt, updatedAt, deletedAt?. Relações: employee?, customer?, roles[], features[], sessions[].
- **Session** (Fase 3): id, userId, refreshTokenHash @unique, usedAt?, invalidatedAt?, expiresAt, userAgent?, ipAddress?, createdAt. Sem campo `token` (era o design antigo, validado no banco a cada request) — o access token é um JWT stateless, validado só localmente por assinatura+expiração; só o refresh (opaco, hash salvo) toca essa tabela, e só em `/refresh`, `/logout` e nos endpoints de sessão.
- **Customer/Employee**: id, userId @unique, deletedAt?, campos próprios (Customer: phone obrigatório, address?, birthDate?; Employee: hiringDate @default(now())). `onDelete: Cascade` no user.
- **UserRole/UserFeature**: `id @id @default(uuid())` (NÃO par composto — mudou para soft delete), deletedAt?. UserFeature: granted, grantedAt @default(now()), updatedAt @updatedAt.
- **Role**: code-seeded, description obrigatória, appliesTo (ProfileKind?). **Feature**: code-seeded.
- Unicidade de override/role ativo: garantida por código (busca ativo → update/create), não por constraint SQL.

**Roles** (em `role.constants.ts`): customer (CUSTOMER), attendant/manager/admin (EMPLOYEE). admin tem `["*"]`. Compostas por grupos semânticos (SELF_MANAGEMENT, USER_ADMINISTRATION, PERMISSION_FEATURES) deduplicados via `[...new Set()]`. `DEFAULT_ROLES as const satisfies readonly RoleDefinition[]`.

**PERMISSION_FEATURES**: read:feature, read:role, read:permission, manage:permission.

**Fase 4 (planejado):** `User` ganha `status UserStatus @default(PENDING)` (`enum UserStatus { PENDING, ACTIVE }`) + `bannedAt?`/`bannedBy?`/`banReason?` (ban ortogonal ao status). Novo model `VerificationToken` (id, userId, tokenHash @unique, purpose, expiresAt, usedAt?, createdAt, `onDelete: Cascade`) + `enum VerificationPurpose { EMAIL_VERIFICATION, PASSWORD_RESET }` — mesmo padrão hash-do-token da `Session`. Nova feature `manage:user:status` em `USER_ADMINISTRATION_FEATURES`. `clearDatabase` passa a limpar `verificationToken`.


---

## 4. Histórico de versões deste contexto
Esta versão consolida o ciclo 1 até o ponto: CRUD de user, soft delete (user/perfil/override/role), módulos role e permission, POSTs de perfil completos, DELETEs de perfil completos (customer e employee) — inclusive remoção seletiva de roles por `appliesTo`, transação atômica, e recusa de deleção do último perfil ativo. Feature `delete:profile` adicionada a `USER_ADMINISTRATION_FEATURES`. Vínculo user↔role completo (`GET`/`POST`/`DELETE` em `/api/v1/users/:userId/roles`), com `toRoleDTO` centralizando o shape de resposta (extraído de `role.service.ts`, reusado em `/roles` e `/users/:userId/roles`) e não-escalação generalizada (`assertAdminForRoleAssignment`) cobrindo atribuição e revogação de roles privilegiadas.

**Fase 3 (fechada):** auth migrada de "1 JWT guardado como Session, validado no banco a cada request" para "access JWT 15min validado localmente + refresh opaco rotativo em `Session`, só tocado em `/refresh`". `authenticate` saiu de global para por-grupo-de-rota; `logout`/`GET`/`DELETE /auth/sessions` aplicam `authenticate`+`canAccess` na própria definição de rota. Endpoints: `login` (sempre cria `Session` nova, sem o quirk de reuso antigo), `refresh` (rotação + detecção de roubo via reuso de token), `logout` (por refresh token + ownership), `GET /auth/sessions` (lista só sessões vivas), `DELETE /auth/sessions/:id` (revogação pontual, 404 unificado pra "não existe" e "existe mas está morta"). No fecho da fase, uma auditoria geral confirmou o resto do app coerente com a mudança e corrigiu dois achados que não eram objetivo original da fase: `canAccess.middleware.ts` migrado de `res.json` cru para `create*Error` (o mesmo padrão já fechado para `authenticate` nesta fase, mas que não tinha sido estendido a `canAccess`), e `refreshSessionSchema` (código morto, pré-datava o design atual) removido. Também foi adicionado um teste de integração ponta-a-ponta (signup real → login → rota protegida → refresh → sessions → logout) e reativados dois testes de regressão em `permission.test.ts` que estavam comentados desde antes da fase por causa de um import de `prisma` faltando (sem relação com a Fase 3, mas achado durante a mesma auditoria).

**Fase 4 (planejada, decisões registradas):** status de conta com verificação de email obrigatória (`status PENDING → ACTIVE` via `POST /auth/verify-email`), ban ortogonal ao status (`bannedAt`/`bannedBy`/`banReason`), serviço de email genérico (nodemailer; mailpit em dev via docker, Resend em prod), recuperação de senha (`forgot`/`reset`, anti-enumeração + invalidação total de sessões), troca de senha logado single-step (só senha atual), e banimento (`POST`/`DELETE /users/:id/ban`, feature `manage:user:status`, proteção de privilegiado, conta congelada). Racional completo na seção 2.1; passo-a-passo atômico no `TODO.md`. Também nesta fase nasceu o `ENDPOINTS.md` (índice interno das rotas, na raiz) — mantê-lo atualizado a cada rota nova.
