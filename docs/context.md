# pet-oasis — Contexto Detalhado

> Referência de consulta. O essencial acionável está no `CLAUDE.md`; o estado das tarefas no `docs/todo.md`. Aqui ficam os detalhes longos: contratos de view, racional das decisões, gotchas técnicos aprendidos. Consulte quando precisar do "porquê" ou de um detalhe específico.
>
> Cobre o **Ciclo 1** (fundação — Fases 1–8, §2.1–§2.6) e abre o **Ciclo 2** (domínio pet shop — Fase 9 em diante, §2.7). Como o `docs/todo.md` resume toda fase fechada, é aqui (e nos ADRs) que o racional dela sobrevive.

---

## 1. Contratos de view (presenter)

Cada recurso tem views resolvidas pela **capability do viewer** (não pelo role). `.parse()` derruba campos não listados → nada sensível vaza por omissão.

**User** — progressão por capability:
- `default` (id, name) → qualquer um vê de qualquer user
- `owner` (+ email, pendingEmail, cpf, customer/employee aninhados nullable) → o próprio dono
- `me` (owner + features efetivas `string[]`) → o próprio, em `/me`
- `admin` (+ createdAt, updatedAt, roles `[{role:{id,name}, features:[{granted,grantedAt,feature}]}]`) → quem tem `read:user:others`. Desde a 8.0 os overrides moram **dentro** da atribuição de role, não num `features` no topo — a view espelha a junção para não perder a qual atribuição cada ajuste pertence

cpf aparece em `owner` (dado próprio) e `admin` (gerente vê — normal em pet shop, vendas ligadas a cpf).

**Role**: id, name, description (obrigatória), appliesTo (`enum`, **não** nullable desde a Fase 8), features `[{id,name,description}]` — junção achatada no service (`role.features.map(rf => rf.feature)`).

**Feature**: id, name, description.

**Permission**: `/features` = overrides crus `[{granted, grantedAt, updatedAt, role, feature}]`; `/permissions` = efetivas `string[]`.

**Session** (`GET /auth/sessions`, desde a 7.17): id, createdAt, expiresAt, ipAddress, `device` e `current`. A view **não** expõe o `userAgent` cru — ele entra parseado por `describeUserAgent` (`src/lib/userAgent.ts`, função pura sobre `ua-parser-js`) como `"Chrome no Windows"`, com fallback `"Dispositivo desconhecido"`. `current` compara o hash do refresh token do cookie da própria request contra o `refreshTokenHash` de cada linha — sem cookie (acesso só com o access token), nenhuma sessão é marcada como atual.

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

## 2.1 Fase 4 (implementada) — decisões e racional

> Decisões da Fase 4 (status de conta, verificação de email, email genérico, troca/recuperação de senha, banimento), firmadas no planejamento e confirmadas na implementação (4.0–4.5, todas feitas). O passo-a-passo atômico está no `docs/todo.md` (seção "Fase 4"). Estas são as regras de negócio e o "porquê" de cada uma.

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

### Fases 4.1–4.4 (implementadas) — decisões firmadas na execução

**Por que só a criação de usuário emite verificação (e os POSTs de perfil NÃO):** a emissão do `VerificationToken(EMAIL_VERIFICATION)` + email mora em `user.service.createCustomer`/`createEmployee`, que cobre os dois caminhos que criam um usuário novo (signup self-service e `POST /users` do admin). `POST /users/:id/customer|employee` **não** emite: adiciona um 2º perfil a um usuário que **já existe** (já tem `status` e já recebeu o email na criação) — re-emitir ali só geraria ruído (reenvio a um user talvez já `ACTIVE`) sem provar nada de novo sobre o email. Verificação é sobre a identidade do email, que não muda ao ganhar um perfil.

**Por que token inválido/expirado/usado no `verify-email` é 400 genérico (não 422/401):** o token é sintaticamente válido (passou no Zod) mas imprestável — não é erro de validação de campo (o 422 do projeto carrega `errors` por campo, que não encaixa num token opaco) nem credencial de sessão (401 é para Bearer/refresh). É um `createBadRequestError` genérico que não vaza **qual** condição falhou (inexistente vs expirado vs usado). Mesmo 400 será reusado no `reset-password` (4.2). Sucesso do `verify-email` → **204** (idioma do projeto para ação sem corpo: logout, DELETE de sessão/perfil).

**Por que a orquestração de verificação vive em `verification.service.ts` (e não em `auth.service`):** `auth.service` já importa `user.service` (para `signup`), e `user.service` precisa disparar a emissão na criação — pôr a emissão em `auth.service` fecharia um ciclo `user.service → auth.service → user.service`. `src/modules/auth/verification.service.ts` concentra `issueEmailVerification`/`verifyEmail`/`resendVerification` importando só `auth.repository` (CRUD do token), `user.repository`, `lib/email` e `lib/token` — ninguém que ele importa reimporta ele. O gate de login continua em `auth.service.login` (só lê `user.status`/`user.bannedAt`, que já vêm no `findUserByEmail`). Análogo: recuperação/troca de senha vive em `password.service.ts` (`requestPasswordReset`/`resetPassword`/`changePassword`), mesma razão de coesão e anti-ciclo.

**Por que 204 em reset/change e 400 em token de reset ruim:** `reset-password` e `change-password` seguem o idioma de ação-sem-corpo → **204** no sucesso (sessões já caíram, o front redireciona pro login). Token de reset inexistente/expirado/usado/`purpose` errado → **400 genérico** (mesmo racional do `verify-email`), `newPassword` fraca → **422** (reusa `passwordSchema`).

**Por que change-password com senha atual errada é 403 (não 401):** a request já está autenticada (Bearer válido) — um 401 seria lido pelo front como "token expirou" e dispararia refresh/logout indevido. O que falhou foi a prova da senha atual (re-autenticação para uma ação sensível), semanticamente 403. (Contraste: no `login`, senha errada é 401 porque ainda não há identidade estabelecida.)

**Por que auto-ban/-unban é 409 e o guard de privilegiado do ban difere do de role:** banir/desbanir a si mesmo é bloqueado com **409** (evita um admin se trancar para fora — único caso alcançável, já que manager/attendant caem antes no guard de privilegiado, pois manager tem `PERMISSION_FEATURES`). O `assertAdminForBan` reusa a âncora "ator precisa ser role admin", mas identifica o **alvo privilegiado** computando as features **efetivas do usuário-alvo** (`getUserForFeatureComputation` + `computeEffectiveFeatures`, checando `*`/`PERMISSION_FEATURES`) — diferente de `assertAdminForRoleAssignment`, que olha as features da *role* sendo atribuída. Ban seta `bannedAt`/`bannedBy`/`banReason` + invalida sessões numa transação; unban limpa as três colunas e preserva o `status`.

**Por que "conta congelada" cobre também reset e change:** além de login/forgot/resend (que já barravam banido desde 4.1/4.2), `reset-password` (token válido) e `change-password` (Bearer válido) passam a recusar dono banido com **403** — fecha a brecha de um token/Bearer emitido enquanto ativo ser usado logo após o ban. Completa o princípio "banido não faz NADA com a conta".

---

## 2.2 Fase 7 (implementada) — decisões e racional

> Fase 7 amplia o escopo original do roadmap (que previa só "rate limiting, account lockout") para incluir observabilidade completa e polimento das features de auth/authz/gestão de usuário já construídas. Decisões tomadas no planejamento, antes de qualquer feat-branch abrir; a fase correu em 9 sessões de trabalho (A–I) sobre as sub-fases 7.0–7.19, hoje **resumidas** no `docs/todo.md` — o passo-a-passo atômico ficou no histórico do git, e o que precisava sobreviver está nesta seção.
>
> Documentos irmãos, para não duplicar racional: **`docs/logging-policy.md`** (as três categorias de log, taxonomia de audit, dados proibidos, retenção), **`docs/adr/rate-limiting-and-lockout.md`** e **`docs/adr/pagination.md`**. Esta seção registra o que se decidiu e por quê; os documentos acima detalham o *como*.

### Segurança e autorização

**Por que Redis (não in-memory) para rate limiting e lockout:** os dois mecanismos compartilham a mesma necessidade — um contador que sobreviva a restart do processo e funcione corretamente mesmo se a app um dia rodar em mais de uma instância. In-memory (`express-rate-limit` puro) resolveria o caso atual (single-instance) mas quebraria silenciosamente no primeiro dia de scale-out horizontal, e zeraria a cada deploy. Custo aceito: um serviço novo (`redis`) nos overrides do Compose e mais uma peça de infra em produção.

**Por que rate limit é por IP e lockout é por conta (dois mecanismos, não um só):** têm alvos diferentes. Rate limit por IP protege contra volume (DoS, scraping, spam de criação de conta) sem se importar com qual conta está sendo tentada. Lockout por conta protege uma credencial específica contra força bruta direcionada, mesmo vinda de IPs diferentes (distribuída/credential stuffing). Um não substitui o outro. Existe ainda uma **terceira chave**, por email destinatário, em `forgot-password` e `verify-email/resend`: ela fecha o furo do atacante que rotaciona IP para bombardear a caixa de uma vítima específica — cada request vem de um IP novo (o limite por IP não vê nada), mas a caixa do alvo recebe tudo e a reputação do domínio remetente queima.

**Lockout híbrido (janela fixa → backoff exponencial):** `N` tentativas erradas consecutivas trava a conta por uma janela fixa; se, depois da janela liberar, a próxima tentativa também errar, o tempo de espera dobra a cada ciclo até um teto. Reseta (contador **e** nível de backoff) no login certo. Motivo do híbrido: janela fixa sozinha é previsível e barata de testar, mas um atacante que espera exatamente o tempo da janela nunca é penalizado mais que isso; o backoff crescente fecha essa lacuna sem penalizar pesadamente o usuário legítimo que só errou a senha uma vez (só entra em jogo depois de repetidos ciclos de erro).

**Por que fail-open quando o Redis cai (risco aceito, não esquecido):** Redis indisponível → rate limit e lockout são ignorados, o request segue, e a falha emite `error` no application log (e no Sentry). Fail-closed (503 nas rotas de auth) eliminaria a janela sem proteção, mas transformaria o Redis em ponto único de falha do **login inteiro** — um restart do container derrubaria a autenticação. Disponibilidade do fluxo principal vence; a mitigação é a falha ser barulhenta, não silenciosa. Racional completo e alternativas no ADR.

**O que a 7.0 mostrou sobre o fail-open:** ele não sai de graça só por estar decidido — depende de o client Redis **falhar rápido**. Com o default do ioredis, um comando emitido enquanto o Redis está fora do ar fica na fila de offline esperando reconexão, e o login pendura em vez de seguir sem o limitador: o fail-open viraria fail-hang. Por isso o client sobe com `enableOfflineQueue: false` e `maxRetriesPerRequest: 1` (e os timeouts da 7.12 fecham o caso do Redis que aceita a conexão e não responde). Verificado derrubando o container com a app no ar: `/status` 200 e login 401, nunca 5xx.

**Isolamento de teste do Redis é por arquivo, não global:** contador de rate limit vaza entre testes, então todo arquivo de integração que autentica chama `flushRedis()` (`tests/helpers/redis.ts`) no próprio `afterEach`. A tentativa de fazer isso num `setupFile` global falhou de um jeito não-óbvio: o `afterEach` global corria antes de a conexão real do ioredis terminar o handshake nos testes **unitários** (rápidos, na casa dos ms) e os derrubava com erro de `enableOfflineQueue`. Escopado por arquivo, fica no mesmo idioma explícito do `clearDatabase()` que a suíte já usa.

**Por que `app.set("trust proxy", 1)` (D7):** o deploy tem um proxy reverso na frente, então `req.ip` sem essa configuração é o IP do proxy — o mesmo para todo mundo. Rate limit por IP (7.9), `Session.ipAddress` e o `ip` do audit log passariam a registrar (e limitar) uma origem só, o que quebraria os três de uma vez, em silêncio. O `1` é literal e não `true`: confia em **um** salto, o proxy que sabemos existir; `true` confiaria na cadeia inteira de `X-Forwarded-For`, que o cliente pode forjar.

**Por que corpo grande demais é 413, e não 400/422:** com `express.json({ limit })` ligado, o body-parser lança um erro `entity.too.large` que ninguém mapeava — a API respondia **500** a um request que ela mesma recusou de propósito (o mesmo tipo de furo do JSON malformado, corrigido na 4.5). 413 é o status que existe exatamente para isso e o que um cliente HTTP sabe interpretar; 400 perderia a distinção entre "JSON quebrado" e "JSON grande demais", e 422 é para corpo bem-formado com semântica inválida — aqui o corpo nem chega a ser lido. A mensagem é genérica: não revela o teto configurado.

**Por que a resposta de conta travada é 429 genérico (não 401, não revela qual mecanismo disparou):** login com senha errada continua 401 genérico (nenhuma identidade estabelecida). Rate limit por IP e lockout por conta devolvem o mesmo 429 ("muitas tentativas, tente novamente mais tarde"), sem indicar qual dos dois disparou nem confirmar a existência da conta além do que as tentativas anteriores já revelam — mesmo espírito anti-enumeração já usado em `forgot-password`/`verify-email/resend`.

**Por que existe desbloqueio manual pelo admin, e por que reseta por completo:** um usuário legítimo travado (ex. esqueceu a senha e errou várias vezes antes de pedir reset) não deveria precisar esperar o backoff vencer sozinho. O desbloqueio (`manage:user:status`, mesma feature do ban/unban) limpa contador e nível de backoff — mesmo idioma de unban (restaura o estado anterior, não deixa resíduo). Não existe "lock manual" pelo admin nesta fase (lock só acontece automaticamente por tentativas erradas) — fora de escopo, registrado no `docs/backlog.md`.

**Por que desbloquear um alvo privilegiado exige ator admin (mesma guarda do ban):** destravar não concede privilégio novo, mas remove uma proteção de segurança sobre a conta-alvo. Um manager comprometido (ou mal-intencionado) poderia destravar uma conta admin no meio de um ataque de força bruta, anulando o lockout bem na hora que ele mais protege — o mesmo raciocínio de escalação lateral já usado em `assertAdminForBan`.

**Por que os 3 guards de escalação (`assertAdminForBan`, `assertAdminForPermissionFeature`, `assertAdminForRoleAssignment`) viram um só:** os três repetem o mesmo miolo — busca o ator, checa `roles.some(r => r.role.name === "admin")`, lança 403 — e só o predicado de "o alvo/feature/role é privilegiado" muda entre eles. Consolidar num `assertActorIsAdmin` compartilhado (em `src/lib/authorization.ts`, ao lado de `can`/`hasFeature`/`canActOnResource`) é o próprio item que o roadmap já sinalizava como pendente ("revisitar proteção de escalação"), e é pré-requisito do `DELETE /users/:id/lock`, que seria o quarto guard copiado. Refactor comportamento-preservado — nenhuma regra de negócio muda, só reduz duplicação. **Ajuste na execução (7.2):** o helper recebe o ator **já buscado** em vez de buscá-lo. Buscar dentro dele eliminaria mais uma linha por chamador, mas obrigaria `src/lib/` a importar `userRepository` — `lib` é a camada transversal e não conhece módulo nenhum; furar isso por uma linha sairia mais caro que a duplicação restante.

**Por que auto-hospedar o bundle da UI Scalar em vez de allowlistar o CDN:** ligar `helmet()` traz uma CSP com `script-src 'self'`, que bloqueia o `cdn.jsdelivr.net` de onde o `/reference` carrega o Scalar hoje (Fase 5.3). Allowlistar o CDN seria uma linha, mas autorizaria um terceiro a executar script na própria origem — enfraquecendo exatamente o que o helmet foi ligado para dar. Servir o bundle do próprio domínio mantém a CSP estrita de verdade e faz o `/reference` funcionar sem internet. Custo: um asset no build e atualização manual quando o Scalar subir de versão. **Como é servido:** rota pública `GET /scalar/standalone.js` (router de topo, `Cache-Control` de 7 dias), com o caminho do arquivo resolvido **em runtime** (`createRequire(...).resolve` na raiz do pacote + `browser/standalone.js`, porque o subpath não está no `exports` do `@scalar/api-reference`) — assim dev (tsx) e produção (bundle do tsup) usam o mesmo código. `withDefaultFonts: false` e `telemetry: false` completam a promessa: a página não faz chamada a terceiro por design.

**CORS de origem não-permitida responde sem os headers, em vez de erro:** quem bloqueia uma origem estranha é o **navegador**, que só precisa da ausência de `Access-Control-Allow-Origin`; lançar ali viraria 500 numa requisição que a API atendeu corretamente. Request sem `Origin` (curl, Bruno, a própria suíte) passa — CORS não é autenticação e não deve virar uma.

**Correção de rota da 7.1 (o que a implementação mostrou):** a análise acima concluía que "um nonce não resolveria, porque o script continua sendo externo" — verdadeiro para o script do CDN, e **insuficiente** na prática. Com o bundle auto-hospedado, sobrou um segundo script: o Scalar inicia por um `<script>` **inline** (`Scalar.createApiReference(...)`), que `script-src 'self'` também bloqueia. Sem nonce, `/reference` responde 200 com a UI em branco — falha invisível para `curl` e para qualquer teste que só cheque status. Então **as duas peças são necessárias**: auto-hospedagem para o bundle, nonce por request para o init inline (nunca `'unsafe-inline'`, que anularia a proteção). Daí também a regra de sempre validar CSP no navegador, e não no terminal.

**Por que sobram violações de CSP no console de `/reference` e por que ficam:** três coisas continuam bloqueadas e nenhuma quebra a UI — um `eval` que o bundle usa como *feature detection* (com fallback), um `<script>` que ele injeta em runtime sem repassar o nonce, e as chamadas ao diretório público de APIs do próprio Scalar (`api.scalar.com`). Silenciá-las custaria `'unsafe-eval'` (a diretiva mais perigosa da CSP) e um `connect-src` para terceiro — preço alto para trocar ruído de console por segurança real. Ficam documentadas em `src/docs/reference.ts` como esperadas, para não serem lidas como regressão depois.

**Por que "refresh token hasheado em repouso" saiu da fase:** o item foi levantado e, na análise, **já estava implementado desde a Fase 3** — `Session.refreshTokenHash` guarda `sha256(token)` (`src/lib/token.ts`), e o token opaco nunca é persistido em plaintext. A comparação em tempo constante que o item pedia também não se aplica: o lookup é `findUnique` pelo hash, não comparação byte a byte de segredo. Restou formalizar em teste de regressão (a coluna nunca contém o token entregue ao cliente; token adulterado → 401). Trocar o sha256 por HMAC com `PEPPER` foi considerado e **recusado**: com token de 32 bytes de entropia não há dicionário a montar, o ganho é marginal, e o custo seria uma migration invalidando todas as sessões vivas — registrado no `docs/backlog.md` caso o cenário mude.

**Fecho (7.19):** o item terminou em teste, não em código — dois casos de regressão em `auth.test.ts` (`describe("POST /api/v1/auth/refresh")`) afirmam que `Session.refreshTokenHash` nunca é igual ao token cru do cookie (e é igual a `hashToken(token cru)`) e que um token adulterado por um caractere devolve 401. Formaliza o comportamento já existente desde a Fase 3, sem mudar nada em produção.

**Adendo (Fase 8.8) — conta demo isenta do lockout:** bug de produção descoberto pós-deploy da Fase 7 (2026-08-04) — como a senha do demo é pública, o lockout por conta (que ignora origem) vira um DoS contra a própria porta de entrada do projeto, ao contrário do rate limit por IP. Isenção identificada pela role `demo` (não por email), sem custo de query extra (`findUserByEmail` já traz `roles` no mesmo fetch de `login()`); rate limit por IP continua valendo para o demo. O critério é simples de propósito — basta ter a role (K28) —, aceitando que conceder `demo` a uma conta real a isentaria também. Racional completo, o K28 e a alternativa descartada (demo-reset limpando `lockout:*`) no ADR `docs/adr/rate-limiting-and-lockout.md`.

### Observabilidade

**Por que três categorias de log e não uma:** access log (tráfego), application log (o que aconteceu dentro do processo) e audit log (quem fez o quê, em quem) têm emissor, volume, destino, mutabilidade e ciclo de vida diferentes. Misturá-los faz cada um herdar o pior do outro — o log de negócio afogado em ruído de tráfego, e o log de tráfego pagando o custo de escrita transacional no banco. A tabela comparativa, a regra de decisão em uma frase e a taxonomia fechada de ações estão em **`docs/logging-policy.md`**, que é a fonte única disso — não duplicar aqui.

**Por que `AsyncLocalStorage` (exceção consciente a "explicit over implicit"):** correlacionar as três categorias exige um `requestId` disponível em qualquer camada. A alternativa explícita seria passar um `context` em toda assinatura de service — dezenas de assinaturas poluídas para entregar um valor usado só no fundo da pilha. A exceção fica **limitada ao contexto de observabilidade**: nenhuma regra de negócio lê do store.

**O que a Sessão B acrescentou (7.3–7.5):** três decisões tomadas na execução, todas com o mesmo espírito de "a política só vale se for testável e localizável".

- **O ambiente de teste não silencia o logger — ele não monta o stdout.** `LOG_LEVEL=silent` deixaria a suíte limpa, mas também impediria testar qualquer linha, e a política depende de teste para valer (§10). Com os destinos escolhidos por ambiente, o test escreve **só no ring buffer**: saída limpa e linhas assertáveis, sem mock, pelo mesmo mecanismo que `GET /logs/recent` vai expor na 7.8.
- **O `requestId` volta ao cliente** — no header `x-request-id` e no corpo de toda resposta de erro. Sem isso, a correlação existe mas é inalcançável a partir do relato de um usuário ("deu erro ontem"); com ela, o id citado recupera access, application e audit log daquele request. O id não é segredo e o corpo de erro continua sem stack.
- **A rota do access log vem do contexto, não de `req.url`.** O Express reescreve `req.url` ao descer nos routers montados e o access log só sai no fim do request — `/api/v1/status` chegava como `/`, e a regra de rota-de-ruído (o healthcheck do Compose, que bate a cada 5s) nunca casava. Um caso em que o teste do comportamento, não do código, foi o que pegou.

**O que a Sessão C fixou na execução (7.6):** duas decisões de encaixe, ambas para respeitar regras que já existiam.

- **A gravação transacional do audit vive no repository, e o service passa o descritor.** A política §4.5 exige que a linha de audit de uma ação que muda estado entre na mesma `$transaction` da mutação; a regra de camadas diz que só o repo toca o Prisma, e é lá que a transação vive. Conciliar os dois: o service decide a semântica (action/targetType/targetId/metadata — decisão de negócio) e passa um `AuditDescriptor` ao método de escrita do repo, que roda mutação + `record(descriptor, tx)` numa transação interativa. A alternativa (service abrir `prisma.$transaction` e passar `tx` ao repo) daria call sites mais idiomáticos, mas furaria "só o repo toca o Prisma" — preterida.
- **`record` é lib de observabilidade, não repository.** Ela pode escrever no Prisma de qualquer camada (o login falho grava direto do service), pelo mesmo enquadramento do `logger`/`AsyncLocalStorage` — observabilidade, não dado de negócio. Com `tx` propaga o erro (rollback §4.5); sem `tx` engole e loga (§4.6).
- **Escopo 12/18:** a sessão ligou só os pontos cujo código já existe; os 6 restantes (lockout, rate limit, forçar senha, troca de email, demo-reset) são das sessões E/H/G, como a coluna "Sub-fase" da taxonomia §4.3 já atribuía. A taxonomia inteira (18) foi declarada como union em tempo de compilação para as futuras já validarem.

**O que a Sessão E fixou na execução (7.9–7.10):** duas decisões tomadas na abertura/execução, nenhuma reabrindo o ADR de rate limiting/lockout — só preenchendo o que ele deixou como implementação.

- **Rate limit por env var vira duas vars por regra (`_MAX` + `_WINDOW_MS`), não uma string composta.** O ADR listava um nome só por regra (`RATE_LIMIT_LOGIN`, default "20 / 15 min"), mas D8 exige a janela configurável também — e não existe no projeto um parser para "contagem/janela" num valor só (ao contrário de `JSON_BODY_LIMIT`, que reusa a lib `bytes`). Confirmado com o usuário na abertura: duas vars, mesmo idioma do `LOCKOUT_THRESHOLD`/`_WINDOW_MS`/`_MAX_MS` que o próprio ADR já separava.
- **A checagem de lockout entra no ramo de senha CORRETA, não antes de verificar a senha.** Colocá-la antes bloquearia toda tentativa (certa ou errada) assim que a conta trava, mas romperia o espírito anti-enumeração dos gates de `bannedAt`/`status` (que só revelam o estado da conta depois de provar a senha). A leitura certa: o rate limit por IP/email-alvo (7.9) já cobre o *volume* de tentativas; o papel do lockout é só impedir que uma senha eventualmente certa — vinda de credential stuffing distribuído — complete o login dentro da janela de bloqueio. Por isso basta checar depois da senha bater, no mesmo lugar dos outros gates. O estado do lockout (`failures`/`backoffLevel`/`lockedUntil`) fica só no Redis, e a transição (`applyFailure`) foi extraída como função **pura** — mesmo idioma de `computeEffectiveFeatures` — testável por unidade sem tocar Redis; os wrappers de leitura/escrita ficam finos em volta dela.

**Por que o audit log passou a ganhar endpoint de leitura (decisão anterior revertida):** o plano original adiava `GET /audit-logs` para uma fase futura, deixando a trilha consultável só via banco. Revertido: uma trilha que só o mantenedor consegue ler não demonstra nada num projeto de portfólio, e a regra de PII da política (`metadata` só com ids e enums) foi tomada justamente para tornar a leitura segura. O endpoint entra com paginação **cursor** e filtros, e é **só `GET`** — a ausência de `PATCH`/`DELETE` é imutabilidade intencional, coberta por teste.

**Por que `read:audit-log:full` e não uma role como âncora:** o `ip` do audit log sai mascarado (`192.168.1.***`) por padrão; a feature `read:audit-log:full` destrava o valor inteiro. Segue o padrão `ação:recurso:modificador` já usado no catálogo (`read:user:others` — o modificador nem sempre é `:others`). Assim o mascaramento vira demonstração de RBAC dentro da própria resposta (o demo lê a trilha e vê IP mascarado; um admin vê inteiro), e a visibilidade de IP fica concedível por override, sem carregar junto o poder de banir que reusar `manage:user:status` traria. Features novas, no singular como o resto do catálogo: **`read:log`** (ring buffer) e **`read:audit-log`** (+ `:full`).

**Por que o ring buffer em memória (`GET /logs/recent`) existe mesmo havendo Axiom:** é a única leitura de log disponível *de dentro da API*, sem conta de terceiro — o que torna a observabilidade demonstrável para quem avalia o projeto. As limitações (é por processo, some no restart) são declaradas no `meta` da própria resposta, em vez de escondidas.

**Por que Axiom e Sentry entram mesmo sem conta configurada:** ambos ativam apenas se as env vars existirem; ausentes, a app degrada para stdout + ring buffer e **boota normalmente**. O subsistema de log nunca pode derrubar a aplicação — nem no boot, nem no request (por isso o Axiom vai em worker thread, fora do caminho síncrono, com `flush` no shutdown; senão os últimos logs antes do SIGTERM se perdem justamente quando mais importam). No Sentry, só falha de verdade é capturada (≥500, não-tratado, `unhandledRejection`, `uncaughtException`): um 404 ou 422 é comportamento correto da API, não incidente. E o `beforeSend` replica a lista de campos proibidos do `redact` — reusando as constantes exportadas de `logger.ts`, para não existir uma segunda lista que diverge —, senão o Sentry vazaria pela porta dos fundos o que a política protege na porta da frente. Gotcha do empacotamento: o `release` do Sentry lê a versão do `package.json` via **`process.cwd()`**, não por caminho relativo ao módulo — o tsup achata `src/lib/sentry.ts` dentro de um `dist/server.js` só, e o cwd é a única referência estável entre dev, teste e produção.

### Contrato de API

**Por que duas estratégias de paginação e um envelope só:** offset (para listas de CRUD, com `total` e salto para página arbitrária) e cursor/keyset (para listas append-only ordenadas por tempo, onde offset pula e repete registros sob escrita concorrente). Naturezas diferentes, ferramentas diferentes — mas **todas** as listagens passam a devolver `{ data, meta }`, inclusive as que não paginam, para o cliente ter um contrato único e para paginar uma delas amanhã ser aditivo em vez de breaking. Exceção: `GET /users/:userId/permissions` segue `string[]` cru (é um conjunto de capacidades computado, não uma coleção de recursos). O tiebreaker por `id` na chave do cursor é **obrigatório** — sem ele, dois registros com o mesmo timestamp fazem a borda da página pular ou repetir. Racional completo, alternativas e limites (`limit` default 20 / máx 100) no `docs/adr/pagination.md`.

### Higiene e ciclo de vida

**Sessões: teto de sessões vivas e faxina de tokens mortos são higiene, não perda de auditoria:** o teto (`MAX_LIVE_SESSIONS`, default 5) evita um usuário acumular sessões vivas indefinidamente — ao exceder, a **mais antiga é invalidada** e o login segue; recusar o login puniria o usuário por uma regra de higiene interna. A faxina faz **hard delete** (não soft delete) de `Session`/`VerificationToken` já mortos há tempo suficiente — são registros técnicos, não dados de negócio, e o rastro de auditoria de verdade agora vive no `AuditLog`, não nessas linhas. **Critério de "morto" (firmado com o usuário):** conta a partir de **qualquer** timestamp de morte — `expiresAt` vencido **OU** `usedAt` **OU** `invalidatedAt`, checados de forma independente —, não só do `expiresAt` natural: uma sessão revogada há meses já é lixo mesmo com `expiresAt` ainda no futuro.

**Por que timeouts em toda dependência externa (7.12, implementado):** sem timeout, uma dependência pendurada exaure o pool e derruba a app inteira — o modo de falha mais comum em produção e o menos exercitado em teste. Cobre HTTP server (`server.headersTimeout`/`requestTimeout`/`keepAliveTimeout`, setados logo após `listen()` — `requestTimeout` > `headersTimeout` é exigido pelo próprio Node), Prisma (`transactionOptions.maxWait`/`timeout` no `PrismaClient`, aplicado a toda `$transaction()`) e Redis (`connectTimeout`/`commandTimeout` — sem os quais o fail-open acima é ilusório, porque um Redis que aceita a conexão mas não responde penduraria o login) e **SMTP via nodemailer** (`connectionTimeout`/`greetingTimeout`/`socketTimeout` no transporter — não `AbortSignal`, que seria o mecanismo se o envio fosse pela API HTTP da Resend em vez de SMTP). Todos por env var, defaults conservadores: `SERVER_HEADERS_TIMEOUT_MS=65000` / `SERVER_REQUEST_TIMEOUT_MS=70000` / `SERVER_KEEP_ALIVE_TIMEOUT_MS=61000` (keep-alive acima do que proxies reversos tipicamente mantêm — ~60s — evita a race clássica de o backend fechar um socket ocioso que o proxy acabou de reaproveitar), `PRISMA_TX_MAX_WAIT_MS=5000` / `PRISMA_TX_TIMEOUT_MS=8000`, `DB_POOL_CONNECT_TIMEOUT_MS=5000`, `REDIS_CONNECT_TIMEOUT_MS=2000` / `REDIS_COMMAND_TIMEOUT_MS=2000`, `SMTP_CONNECTION_TIMEOUT_MS=10000` / `SMTP_GREETING_TIMEOUT_MS=5000` / `SMTP_SOCKET_TIMEOUT_MS=20000`.
>
> **Correção em relação ao planejamento original:** o item falava em "timeout de pool na connection string", mas o projeto usa `@prisma/adapter-pg` (driver adapter), não o pool nativo do Prisma — os parâmetros clássicos de URL (`connection_limit`, `pool_timeout`) não são lidos por esse caminho. O timeout de aquisição de conexão é `connectionTimeoutMillis`, um campo irmão de `connectionString` no `pg.PoolConfig` passado ao `PrismaPg`. O objetivo (pool não trava pra sempre esperando conexão) é o mesmo; só a forma de configurar mudou.

**Por que o reset do ambiente demo é truncate+reseed, e por que não infere de `NODE_ENV`:** "deletar o que não é seed" exigiria um marcador em toda tabela e cresceria a cada model novo da Fase 9; truncate+reseed é determinístico e não cresce. A guarda é uma flag explícita `DEMO_MODE=true` — **não** `NODE_ENV`, porque o deploy demo *é* production, e inferir apagaria o banco de produção de verdade caso o projeto ganhe um. Sem a flag: erro barulhento, exit ≠ 0, nada apagado. O reset é **diário** (não a cada 3 dias) para que ninguém encontre a bagunça do visitante anterior, com o horário publicado na doc — o que transforma um logout inesperado em comportamento documentado. Corte de responsabilidade: `src/scripts/` é código (importa Prisma/`env`/`logger`, bundlado pelo tsup); `infra/` é agendamento (systemd timer, preferido a cron por dar `journalctl`, `Persistent=` e proteção contra sobreposição). O reset é **higiene**, não o que garante o demo read-only — isso é RBAC (role `demo`, Fase 5); são duas defesas independentes.

**Gotcha do reseed compartilhado (7.14):** o seed foi extraído para `src/lib/seedDatabase.ts` (`runSeed`, **sem nenhum código auto-executável no nível do módulo**) e é reusado por `prisma/seed.ts` (CLI) e por `demo-reset.ts`. A primeira tentativa importava `runSeed` direto de `prisma/seed.ts`, que tinha um `main()` guardado por `import.meta.url === argv[1]` — o guard funciona em dev, mas o tsup bundla os dois scripts num módulo só, então ambos os guards passaram a comparar contra o **mesmo** `import.meta.url`/`argv[1]` e disparavam juntos: rodar `demo-reset.js` executava (e desconectava) o `main()` do seed por baixo. A lição vale para qualquer script novo: código reaproveitado entre entrypoints não pode carregar auto-execução.

**O que a Sessão H fixou no desenho (7.15–7.16), antes da implementação:** as duas mudam decisões de negócio já fechadas antes (email era imutável) ou introduzem um estado novo de conta (`mustChangePassword`) com implicações de UX — por isso, ao contrário do resto da fase, ficaram sem desenho até serem confirmadas com o usuário em 2026-08-03. O que cada uma entregou está resumido no `docs/todo.md`; aqui fica o "porquê" das escolhas não-óbvias.

- **Troca de email é 2 passos, e o alvo mora no token, não só em `User.pendingEmail`.** `pendingEmail` existe pra exibição (`GET /me`) e pro `PATCH /users/:id` continuar recusando email (reabre `user.schema.ts:56`, mas por um endpoint dedicado). A verdade sobre qual email um token confirma vive na própria linha do `VerificationToken` (`newEmail`) — se isso dependesse só de reler `pendingEmail` no confirm, um usuário que pedisse a troca duas vezes seguidas (A depois B) poderia ter o link antigo (de A) confirmando B, porque a coluna já teria sido sobrescrita. Uma nova chamada de `change-email` invalida o token anterior e sobrescreve `pendingEmail` — mesmo idioma de "unicidade do ativo por código" que `UserFeature`/`UserRole` já usam — e isso dobra como mecanismo de cancelamento: o dono real, se ainda souber a própria senha, sobrescreve uma troca maliciosa pedindo a troca de volta pro próprio email.
- **Por que o endpoint de troca revela conflito (409) e o `forgot-password` não:** o `forgot-password` é anônimo — qualquer um pode testar emails para descobrir quais existem, então a resposta é sempre genérica. `change-email` exige a senha atual da própria conta; para alguém abusar do 409 pra enumerar, precisaria já ter comprometido essa conta, ponto em que enumerar emails de terceiros é o menor dos danos possíveis. Mesma lógica que já vale pro signup, que expõe 409 de unicidade hoje.
- **Por que o aviso de segurança vai para o email antigo, e no pedido — não na confirmação:** o cenário que essa notificação existe para cobrir é sessão/senha comprometida. Nesse cenário, o atacante tem a senha mas não necessariamente a caixa de entrada antiga — então é o dono real, ainda com acesso ao email antigo, quem recebe o aviso. Mandar só depois de confirmada a troca chegaria tarde demais pra reagir; mandar no pedido é a única janela em que a troca ainda não é definitiva.
- **Por que email trocado fica reservado para sempre (`PreviousEmail`, tabela dedicada, unique global):** mesmo racional do email "preso" de conta soft-deletada (nota da Fase 8) — sem isso, alguém que reconquiste uma caixa de entrada antiga poderia se cadastrar do zero se passando pelo dono original. Ser tabela (não array em `User`) segue o idioma de histórico do projeto (`AuditLog`, `VerificationToken`): cada entrada tem timestamp próprio, é indexável e sobra espaço pra metadado futuro. A reserva só funciona se o signup também consultar essa tabela — não só o unique de `User.email` — senão dá pra furar a regra simplesmente criando conta nova em vez de pedir a troca.
  - 🔸 **Errata (8.6):** decisão **revertida** — ver "Por que `PreviousEmail` parou de bloquear" na seção da Fase 8. A tabela continua existindo como histórico; o `unique global` da coluna `email` saiu junto.
- **Por que forçar-troca-de-senha bloqueia o login inteiro, em vez de deixar entrar sinalizando a troca:** um admin força esse reset justamente porque a senha atual pode estar comprometida. Deixar essa senha completar login — mesmo que só para cair numa tela de "troque agora" — dá a quem tiver a senha (inclusive um atacante) uma sessão válida antes da troca acontecer, o que anula o motivo do reset. O único caminho de volta é o link por email, mesmo desenho do `forgot-password` — só a origem do token muda (admin em vez do próprio usuário), e `resetPassword` (já existente) só precisou ganhar mais um passo: limpar `mustChangePassword` ao consumir o token.
- **Por que a checagem de `mustChangePassword` entra depois do `bannedAt` e antes do `status`, na ordem do login:** banimento é a decisão mais severa e terminal (um humano cortou o acesso de propósito); `mustChangePassword` é recuperável via email. Se as duas condições coexistirem (conta banida **e** com reset forçado pendente — ex. durante uma investigação), a mensagem de banido é a que aparece, porque é a informação dominante para quem está tentando entrar.
- **Por que o admin dispara o email de reset na hora, em vez de esperar o usuário pedir "esqueci minha senha":** reaproveita o `buildPasswordResetEmail` já existente, mas some com a ambiguidade de "por que fui deslogado e não consigo mais entrar" — o usuário recebe o porquê e o link no mesmo momento em que a sessão cai.

---

## 2.3 Fase 5 (implementada) — Documentação + Deploy

> Decisões da Fase 5 (OpenAPI gerado dos schemas Zod → UI Scalar → coleção Bruno; usuário demo read-only; containerização full-stack), firmadas no planejamento e confirmadas na implementação (5.0–5.9). Passo-a-passo atômico no `docs/todo.md` (seção "Fase 5"). Esta fase fecha o Ciclo 1 como peça de portfólio: **nenhuma regra de negócio nova** — é documentação e empacotamento do que já existia.

**Por que a doc é gerada dos próprios schemas Zod (fonte única), e não escrita à mão:** o contrato da API já vive nos `*.schema.ts` (request) e `*.presenter.ts` (response). Escrever um OpenAPI paralelo à mão criaria duas fontes que divergem no primeiro refactor. Com o `.meta({ description, example })` **nativo do Zod 4** (sem monkey-patch, sem `zod-to-openapi` patchando o protótipo), cada schema carrega a própria doc e o `createDocument` (`zod-openapi`) monta o `/openapi.json`. O envelope `{ body, params, query }` que os controllers já usam é extraído por `.shape.*` num helper (`fromEnvelope`), com guarda de presença — sem quebrar a convenção existente.

**Por que os presenters (views por whitelist) garantem que a doc não vaza segredo:** as views já derrubam campos não listados via `.parse()` (`passwordHash`, `tokenHash`, `refreshTokenHash` nunca entram na resposta). Como os exemplos de response no OpenAPI saem **das mesmas views**, o documento herda a mesma garantia — verificado por teste (`openapi.test.ts`: a spec não contém nenhum desses campos). Documentar a partir da whitelist é mais seguro do que anotar exemplos à mão, que poderiam reintroduzir um campo sensível por descuido.

**Por que `/openapi.json` e `/reference` são públicas e montadas no router de topo (fora de `/api/v1`):** documentação de API é para ser lida sem credencial; travá-la atrás de `authenticate` só atrapalharia. Ficam no router de topo, antes dos grupos protegidos, sem token. A UI Scalar (`/reference`) consome o `/openapi.json` e tem "try it" com Bearer preenchível — daí o `securitySchemes.bearerAuth` global no documento, com as operações públicas sobrescrevendo `security: []`.

**Por que o token da coleção Bruno é salvo com `bru.setVar` e não `setEnvVar`:** o `script:post-response` do request `Login` encadeia o access token nas demais requests da coleção. `setEnvVar` grava o valor no arquivo do environment, que é **versionado** — o token do usuário demo acabaria commitado no `api-collection/`. `bru.setVar` guarda em memória, só durante a execução (também o caminho já preferido no Bruno v4, que está descontinuando `setEnvVar` para esse uso).

**Por que um usuário demo read-only, com a role sempre semeada mas o usuário atrás de um flag:** o objetivo é deixar qualquer visitante exercitar o RBAC ao vivo (todo `GET` → 200, toda escrita → 403) sem poder sujar ou quebrar dados. A role `demo` (`appliesTo EMPLOYEE`, só features de leitura) é sempre semeada — faz parte do catálogo. Já o **usuário** demo só nasce com `SEED_DEMO_USER=true` (ligado no Docker/prod, desligado em dev/test para não sujar a suíte). Assim o mesmo seed serve dev, teste e produção sem ramificar por ambiente além desse único flag. As credenciais são públicas de propósito (`env.DEMO_EMAIL`/`DEMO_PASSWORD`), e o seed limpa `bannedAt/bannedBy/banReason` no update (um redeploy sempre restaura o demo utilizável).

**Por que produção usa `migrate deploy` (nunca `migrate dev`) no entrypoint:** `migrate dev` é interativo, pode gerar/aplicar migrations novas e resetar o banco em caso de drift — comportamento inaceitável num servidor. `migrate deploy` só aplica as migrations já versionadas, de forma idempotente e não-interativa. O entrypoint do container faz `migrate deploy → seed → start`: a subida deixa um ambiente do zero funcionando. O seed é idempotente (upserts), então rodar a cada start é seguro.

**Por que o seed é bundlado pelo tsup (`dist/seed.js`) em vez de rodar via `prisma db seed`/tsx:** o `prisma db seed` invoca `tsx prisma/seed.ts`, que importa de `src/` — nada disso existe na imagem de produção (só `dist/` + node_modules de prod, sem `tsx` nem código-fonte). Adicionar o `prisma/seed.ts` como 2ª entry do tsup (`entry: { server, seed }`) produz um `dist/seed.js` auto-contido (o client Prisma gerado é embutido no bundle, o wasm do query-compiler vem de `@prisma/client` em runtime), que o entrypoint roda com `node dist/seed.js`. O fluxo de dev segue usando `prisma db seed` (tsx) inalterado.

**Por que o serviço `app` do compose fica atrás de um profile (`full`) e deriva a própria `DATABASE_URL`:** o fluxo de dev roda o app **no host** (via `tsx`, hot-reload) com só a infra em container (`db`/`db_test`/`mailpit`) — `npm run services:up` (= `docker compose up -d`) não pode passar a subir também um app-em-container e brigar pela porta. Pondo o `app` sob `profiles: ["full"]`, o `up` sem profile o ignora; ele só sobe com `npm run stack:up` (`--profile full`). E como o app-em-container alcança o Postgres pelo **nome do serviço** (`db`), não por `localhost`, o serviço `app` monta sua própria `DATABASE_URL` (`@db:5432`, derivada de `POSTGRES_*`) no compose, deixando o `DATABASE_URL` do `.env` (localhost) intacto para o tooling do host. Um `.env`, dois consumidores, sem conflito.

**Por que a imagem é multi-stage e não-root:** o build (deps completas, `prisma generate`, `tsup`) é pesado e não precisa ir para produção; um stage `deps` isola as dependências de produção, o stage `build` gera o `dist/`, e o `runtime` copia só `node_modules` de prod + `dist/` + o schema/migrations (para o `migrate deploy`). Roda como `USER node` (não-root) — higiene básica de container.

---

## 2.4 Fase 6 (implementada) — Ambientes + Deploy

> Reformulação de ambientes (dev/test/prod), motivada por dois bugs de deploy e um débito estrutural. Nenhuma regra de negócio nova. ADR dedicado em `docs/adr/environments-and-deploy.md`; passo-a-passo no `docs/todo.md`.

**Os dois bugs corrigidos:** (1) o app nunca falava com a Resend — o compose único **hardcodava** `SMTP_HOST: mailpit`/`SMTP_PORT: 1025` no serviço `app` e não repassava `SMTP_USER`/`SMTP_PASS`; (2) um bring-up de "produção" subia `db_test` e `mailpit` (sem profile, sempre ligados).

**Por que Compose base + overrides (supera o profile `full`/app-no-host da §2.3):** um `docker-compose.yml` base (só o esqueleto do `app`) + `docker-compose.{dev,prod,test}.yml`. Mailpit e Postgres-de-dev existem só no override de dev; **prod sobe só `app` + Postgres-de-prod**; test sobe só Postgres-de-test (mailpit-de-test atrás de `--profile mail`, inerte porque os testes mockam `@/lib/email`). Isolamento por **nome de projeto** (`-p pet-oasis-{dev,test,prod}`) + `container_name`/volumes/portas distintos → dev e test rodam juntos. O SMTP do app agora vem inteiro do `env_file` (mata o bug 1); prod não instancia infra de dev/test (mata o bug 2). O app-em-dev também passa a rodar **em container** (via `tsx watch` lendo `src/` por bind-mount), não mais no host.

**Por que envs por arquivo + dotenv-cli (colapsa 5 fontes numa por ambiente):** `.env.development`/`.env.test`/`.env.production` (fora do git) + `.env.example` versionado. Containers recebem via `env_file:`. No host, o `vitest.config.ts` carrega `.env.test` (`override:true`) — então `npx vitest run <arquivo>` funciona sozinho — e a autoria de migration usa `dotenv-cli` (`dotenv -e .env.development -- prisma …`). A URL do banco de teste, antes duplicada em 4 lugares, vive só no `.env.test`. `src/config/env.ts`/`prisma.config.ts` ficam intocados (o `import "dotenv/config"` vira no-op sem `.env` na raiz).

**Por que graceful shutdown nativo do Compose (não script com `spawn`):** healthchecks + `depends_on: service_healthy` + `--wait` (prod/test); dev em **foreground** (incompatível com `--wait`), Ctrl+C → SIGTERM gracioso. O app trata SIGTERM/SIGINT via `createShutdownHandler` (`src/lib/shutdown.ts`, injeção de dependência → testável): `server.close()` (drena in-flight) → `prisma.$disconnect()` → exit, com timeout de força-saída (10s < `stop_grace_period` 15s do prod). O entrypoint faz `exec` do Node/tsx para ele ser **PID 1** e receber o sinal.

**Por que o client Prisma do dev num volume anônimo:** o generator escreve em `src/generated`, que o bind-mount de `./src` mascararia; um volume anônimo em `/app/src/generated` preserva o client gerado no container (o entrypoint de dev roda `prisma generate` no start). Evita churn nos imports `@/generated`. O stage `dev` do Dockerfile para no `npm ci` completo (sem bundle/prune) e fica root (evita EACCES de uid no bind-mount); o `runtime` de prod segue intocado.

**Achado — `clearDatabase` não era bug:** só apaga tabelas transacionais; `Feature`/`Role`/`RoleFeature` (seed do `globalSetup`) já eram preservadas entre testes — que é o que as factories precisam. Adicionado teste-guarda (`clearDatabase.guard.test.ts`) contra regressão futura.

---

## 2.5 Seed de dados fake (implementado) — usuários

> Trabalho pontual entre a Fase 7 e a Fase 8 (não é fase numerada). Passo-a-passo no `docs/todo.md`, seção "Seed de dados fake (usuários)".

**Por que duas flags independentes (`SEED_FAKE_DATA` e `SEED_ADMIN_USER`), e não uma só:** o dataset fake (customers/employees/híbridos) é seguro no demo público — mesmo com escrita disponível via roles `manager`, o dano fica contido ao próprio dataset fake e o `demo-reset` diário restaura. Já o usuário admin de teste tem acesso total (`*`), e diferente do usuário demo (só leitura, já com credencial pública assumida como risco baixo), uma conta de escrita irrestrita exposta na internet é uma superfície de ataque real, mesmo que os dados voltem todo dia. Separar as flags permite ligar o dataset fake em produção/demo sem nunca ligar o admin lá — decisão confirmada com o usuário antes da implementação: `SEED_ADMIN_USER` só existe em `.env.development`.

**Por que o dataset fake inclui roles com escrita (`manager`) mesmo sabendo do risco:** sinalizado explicitamente ao usuário antes de implementar (mesmo racional de "credencial pública, risco baixo, dado sempre restaurável" já usado para o `DEMO_PASSWORD`) — sem isso, o dataset não demonstraria as features de gestão de usuário (ban, force-password-reset, permission override) na prática. Aceito conscientemente, não por omissão.

**Por que a idempotência depende só do email fixo, não de dado determinístico ponta-a-ponta:** a primeira versão do design cogitava semear nome/cpf/telefone com um `faker.seed()` fixo para que o dataset fosse idêntico a cada reseed. Na implementação, ficou claro que isso não é necessário: a checagem de idempotência é "existe um user com este email? se sim, pula" — uma vez criado, reruns nunca voltam a tocar CPF/nome/telefone daquele registro. `cpf-cnpj-validator` (`cpf.generate()`) também não é determinístico via seed do Faker (usa `Math.random` internamente, biblioteca própria), então perseguir determinismo total exigiria mais uma dependência tratável — descartado por não comprar nada: ninguém depende do CPF exato de um usuário fake. Nome/telefone ainda usam uma instância própria de Faker com seed fixo (mais consistente entre execuções, sem custo), mas isso é estética, não a garantia de idempotência.

**Por que uma instância própria de Faker, não o `faker` singleton dos testes:** `@faker-js/faker` exporta um singleton compartilhado; chamar `.seed()` nele mudaria o stream de valores consumido por qualquer teste que rode no mesmo processo depois do módulo de seed ser importado — flakiness sutil dependente de ordem de import. `new Faker({ locale: [en] })` isola completamente o gerador do dataset fake do gerador usado pelas factories de teste.

**Por que o dataset fake é criado direto via `userRepository`, não via `user.service`:** `user.service.createCustomer`/`createEmployee` dispara `issueEmailVerification` (email real, via SMTP). Rodando o seed a cada boot do container (entrypoint `migrate deploy → seed → start`), isso bombardearia o relay de emails de verificação inúteis a cada restart. O repository (mesma técnica de `tests/factories/user.factory.ts`) cria o usuário sem esse efeito colateral, e o `status` é forçado direto por `prisma.user.update` depois — idêntico ao que os testes já faziam.

**Achado, corrigido junto (não era objetivo original):** `demo-reset.ts` truncava 8 tabelas na mesma ordem FK-safe de `clearDatabase()`, mas esqueceu `previousEmail` — a tabela só nasceu na Fase 7.15, depois da 7.14 ter sido escrita, e ninguém voltou para atualizar a lista. Sem o fix, um email trocado via `change-email` no ambiente demo ficaria **preso para sempre** mesmo após o reset diário — na época, `PreviousEmail.email` era unique global e não havia caminho de volta para endereço nenhum.
  - 🔸 **Errata (8.6):** a consequência descrita acima deixou de existir — o `@unique` da coluna saiu (K25) e `PreviousEmail` parou de bloquear qualquer coisa. O fix do `demo-reset.ts` continua certo pelo motivo geral (a tabela é transacional e tem de voltar ao estado inicial), só não é mais o que impede um email de ficar preso.

---

## 2.6 Fase 8 (implementada) — decisões e racional

> A Fase 8 é a única fase do projeto que foi **implementada, revertida e refeita**. O desenho original construiu uma máquina de reativação de conta em cima de dois bugs pré-existentes (deleção de usuário que não cascateava; override de feature sem escopo), e boa parte da complexidade que produziu existia só para contorná-los. O código foi revertido para `d1b8478` em 2026-08-07 e a fase refeita com o escopo ampliado: primeiro consertar o modelo de autorização e o ciclo de vida de deleção, só então construir a reativação em cima de um modelo consistente.
>
> Documento irmão, para não duplicar racional: **`docs/adr/authorization-scope-and-lifecycle.md`** (o *porquê* longo de D2/D3/D4/D5/D6', as alternativas recusadas e as invariantes de implementação). Esta seção registra as decisões da fase; o ADR detalha o modelo.
>
> Os rótulos **D1–D16** (decisões do redesenho, 2026-08-07) e **K1–K31** (decisões dos kickoffs de sessão) aparecem citados aqui, no ADR e nos comentários de código. As tabelas originais viviam no `docs/todo.md` e foram dissolvidas quando a fase fechou e virou resumo: cada decisão que ainda vale está enunciada por extenso nesta seção ou no ADR — o rótulo é só o identificador histórico dela.

### Modelo de autorização — o override ganha dono

**Por que o override pendura na atribuição de role, não no usuário (D2):** override é sobre a **função**, não sobre a pessoa. Escopo de usuário deixava um ajuste concedido "pro trabalho de estoquista" sobreviver à perda da role de estoquista — e, pior, à deleção do perfil inteiro de funcionário, virando vazamento de privilégio. Escopo de *perfil* foi cogitado e recusado: é grosso demais, não captura mudança de função dentro do mesmo perfil.

**Por que uma linha por `(userId, roleId)` para sempre (D3):** a unicidade saiu do código e foi para o banco. Isso exige **reuso de linha** na re-concessão (`deletedAt = null`) em vez de linha nova, o que dá à `UserRole` uma **identidade estável** — sem ela o FK do override ficaria órfão a cada ciclo de revogar/reconceder. O histórico de ciclos (concedido quando, revogado quando) não cabe mais na tabela e vive no audit log (D7): tabela guarda estado, audit log guarda história.

**Por que a role vai no path do override (D9):** a identidade do recurso é a tripla `(user, role, feature)`. Body não identifica recurso — quebraria a idempotência do `PUT`, e o `DELETE` não tem semântica de body.

**Por que 422 no `PUT` sem a role ativa, mas 404 no `DELETE`:** assimetria deliberada. No `PUT` a role é pré-condição da criação, então a validação semântica nomeia o campo (`errors.roleId`) e orienta o caminho. No `DELETE` um único 404 cobre a tripla inteira e **não revela** se o usuário tem aquela role.

**Consequência no cômputo:** `computeEffectiveFeatures` não mudou de assinatura, mas passou a ser **dois laços e não um aninhado** — todas as features estáticas antes de qualquer override. Num laço só, um deny pendurado na role A seria aplicado antes de a role B somar a feature, e o resultado dependeria da ordem das roles.

**Consequência na view:** `userViews.admin` deixou de ter `features` no topo e passou a espelhar a junção (`roles[].features[]`); `GET /users/:id/features` expõe a role de cada override; `GET /users/:id/permissions` continua `string[]` plano.

### Ciclo de vida — a cascata desce quatro níveis, a restauração sobe dois

**Por que a cascata é escrita à mão e não pelo banco:** `onDelete: Cascade` é ação referencial de *hard delete* — dispara no `DELETE` físico da linha pai. Aqui o pai não é apagado (`UPDATE users SET deleted_at = ...`), e FK não propaga UPDATE de coluna comum. O nativo seria **trigger**, recusada porque o Prisma não a gerencia (SQL cru numa migration, fora do typecheck e dos testes) e porque ela não devolve as contagens que o audit precisa. Nested write cobre parte (`roles: { updateMany: ... }`), mas `updateMany` só aceita `where` + `data`: não desce até o **neto** (`UserFeature` via `UserRole`).

**Por que um único `new Date()` por transação (D4):** o timestamp é a chave de correlação da restauração. Mesma transação **não** garante mesmo instante — quem gera é o JS, não o banco —, e `deleteCustomerProfile` chamava `new Date()` duas vezes, o `softDelete` do user três. Se essa invariante vazar, o bug é **silencioso**: nada quebra na deleção, só a restauração passa a não achar os filhos. Por isso tem teste dedicado provando a igualdade nos quatro níveis, e nenhuma função de cascata pode chamar `new Date()` internamente — o valor entra por parâmetro.

**Por que a correlação é por data e não por uma coluna de "motivo" (D5):** foi cogitada uma `deletionScope` (`EXPLICIT`/`PROFILE`/`USER`) para tornar a linha autoexplicativa, e recusada — suja a tabela sem ganho, porque a data já resolve o único caso difícil: o admin religa um perfil e **escolhe não** trazer uma role; numa segunda deleção/reativação, a rejeitada não pode voltar de carona. Com data resolve-se sozinho (perfil morre em T2 com as roles A e B; admin religa só A; perfil morre de novo em T3, levando só A; religar restaura onde `deletedAt == T3` → B, parada em T2, não bate mais). Nenhuma regra extra necessária.

**Por que a restauração para na role (D6', Sessão C):** a cascata de **deleção** desce quatro níveis; a **restauração** sobe só dois. A assimetria é principiada: deletar demais é *fail-closed*, restaurar demais é vazamento de privilégio — as duas direções têm perfil de risco oposto e por isso param em lugares diferentes. Some a isso que override é ajuste fino e pontual: quem devolve um cargo a alguém frequentemente não sabe que havia override pendurado nele, e ressuscitá-lo em silêncio é conceder permissão sem ninguém ter decidido conceder. Override volta **só por ação explícita** (`PUT` na tripla, que revive a linha soft-deletada); a linha morta fica como evidência para o audit. Corroborado pelo mercado: Azure/GCP/K8s RBAC não têm override por usuário, e o inline policy do AWS IAM é destrutivo na remoção. **Isso matou o D16** (o guard de não-escalação sobre o conteúdo restaurado) e a ação de audit `USER_PERMISSION_RESTORE_SKIPPED`: sem conteúdo dinâmico ressuscitando, `assertAdminForRoleAssignment` — que lê as features **estáticas** da role — volta a bastar. Custo assumido: quem tira e devolve um cargo refaz os ajustes à mão, com o audit log (`USER_PERMISSION_GRANTED`/`_REVOKED`) dizendo o que havia.

**Por que o nível `User` → perfil deixou de correlacionar (K20, Sessão D):** o D5 original mandava restaurar o perfil cujo `deletedAt` batesse com o da conta, e isso produzia um beco sem saída — ex-cliente perde o perfil em T1, tem a conta deletada em T2, e ao reativar não restaura (T1 ≠ T2) nem cria do zero (a linha existe), terminando com conta ativa e **zero** perfil ativo, contra o D14. A correlação existia para impedir carona; só que nesse nível ninguém pega carona, porque **perfil nenhum volta sem ser nomeado** (o self-service nomeia `CUSTOMER` e só; o admin nomeia a escolha dele). O corte mudou de lugar: *perfil volta porque foi pedido; role volta porque correlaciona.*

### Perfil e conta — os fluxos de produto

**Por que a mesma rota cria e reativa o perfil (8.3):** o cliente não sabe — nem deveria precisar saber — se aquele usuário já teve o perfil algum dia. Dois endpoints obrigariam a consultar o estado antes de escolher o verbo, e a resposta é **201 nos dois ramos** pelo mesmo motivo (mesmo idioma do K4, em que re-conceder uma role não revela o reuso da linha). Quem ramifica é o service, lendo o banco.

**Autorização em duas etapas na rota de perfil:** o `canAccess` ganhou a forma OR (`string[]`) e declara as duas features, porque o ramo só é conhecido depois de ler o banco; o service reconfere a específica do ramo que correu. Sem a segunda etapa, ter só `reactivate:` deixaria criar do zero. A checagem vem **antes** da busca do usuário (403 vence 404), então é a união das duas features que abre a porta.

**Por que o nome da feature diz o recurso (`create:customer-profile`, não `create:profile`):** o attendant precisa poder atender um cliente no balcão sem ganhar poder nenhum sobre perfil de funcionário. Com um `create:profile:others` genérico gateando as duas rotas, dar a feature ao attendant seria escalação; com o recurso no nome, `canActOnResource` ainda casa self e `:others` sozinho, e quem lê `GET /features` não precisa adivinhar o alcance de cada uma.

**Por que `reactivate:*` é feature separada de `create:*` (K12):** são poderes diferentes — criar um perfil o faz nascer com as roles default; reativar traz de volta as roles que aquele perfil tinha antes de morrer, incluindo as que um admin concedeu no passado. Mantê-las separadas deixa cada uma concedível e revogável por override sem carregar a outra junto; um `manage:profile` genérico daria a quem só precisa cadastrar cliente no balcão o poder de ressuscitar um conjunto de permissões que ele nem consegue enxergar.

**Por que `create:customer-profile`/`reactivate:customer-profile` moram em `SELF_MANAGEMENT_FEATURES`:** a role `customer` morre exatamente quando o perfil de cliente é deletado. Se a feature de reativar morasse nela, sumiria no instante em que passaria a ser necessária — o self-service seria estruturalmente inalcançável. No baseline ela chega pela role de funcionário, que é quem sobrou vivo.

**`roleNames` é "com que roles o perfil (ou a conta) volta"**, não um filtro de restauração: cada nome é **restaurado** (se morreu naquela cascata — o `deletedAt` casa com o do perfil) ou **concedido** (se morreu noutro instante ou nunca existiu). É a mesma semântica de criar, e é o que faz a rota se comportar igual nos dois ramos. **Omitido, vale o default do D8:** voltam todas as roles que morreram naquela cascata — o caminho comum ("devolve como estava") não obriga ninguém a enumerar nada, e escolher um subconjunto continua possível. Uma semântica só no projeto, no nível de perfil (K15) e no de conta (K21). Conceder role por aqui é conceder role, então roda o mesmo `assertAdminForRoleAssignment` de `POST /users/:id/roles/:roleId`.

**`grantRolesToUser` nasceu como primitiva** (`user.lifecycle.repository.ts`) porque três caminhos precisam do reuso de linha do D3 e um `create` cru estoura o `@@unique([userId, roleId])` sempre que já houve aquele par: `addUserRole`, a criação de perfil e a reativação nomeando uma role morta fora daquela cascata.

**Por que a reativação de conta exige senha nova (K17):** a conta nunca volta com a credencial de antes da deleção — que pode ter sido justamente o motivo dela. A rota de confirmação é pública e o **token é a credencial** (molde do `reset-password`), então consumir o token também prova posse do email: por isso a confirmação já seta `status = ACTIVE` e zera `mustChangePassword`, em vez de exigir um `verify-email` depois.

**Por que o signup que dispara reativação responde 202 (K18):** primeiro 202 do projeto, e ele diz exatamente o que houve — pedido aceito, **nenhum recurso criado**, efeito fora da request (o email). 201 mentiria sobre criação e 200 seria menos expressivo num POST sem corpo útil. O anti-enumeração continua: cpf que não bate, conta banida (K24) e conta ativa (D12) devolvem o mesmo 409 genérico, indistinguíveis entre si.

**Por que o `phone` é pedido na confirmação, e não no pedido (K23):** ele só é necessário no ramo em que o perfil de cliente **nasce do zero** (conta que só tinha funcionário), e nesse ramo falta um telefone obrigatório que ninguém tem além do próprio dono. Pedi-lo na emissão do token exigiria uma coluna nova para carregá-lo até a confirmação; pedi-lo na confirmação não custa nada, porque quem confirma é justamente o dono. Ausente quando o ramo exige → 422 em `errors.phone`. No ramo de restauração ele é opcional e **atualiza** o perfil restaurado — hoje é o único caminho que grava `Customer.phone` depois da criação (`PATCH /users/:id` só aceita `name`).

**Por que os três níveis de restauração nasceram como primitivas de repositório (K7):** só o nível de role tinha rota HTTP quando a mecânica foi escrita (8.2). Em vez de adiar perfil e conta para as sub-fases que os expõem — o que desenharia a mesma mecânica três vezes —, os três níveis nasceram juntos em `user.lifecycle.repository.ts`, com os dois sem rota cobertos por teste de integração chamando o repositório direto (`tests/integration/modules/user/user.lifecycle.test.ts`, precedente de `tests/integration/scripts/` e `tests/integration/lib/seed/`). As sub-fases seguintes só ligaram rota e ator, sem uma linha nova de mecânica.

**Por que o admin não reativa nada sozinho:** `POST /users/:id/reactivate` só emite o token e envia o email — quem conclui é o dono da conta, na mesma confirmação pública do self-service. Os dois caminhos convergem num ponto só, e a volta de uma conta sempre passa por alguém que prova posse do email.

**Por que o guard de não-escalação corre sobre as roles que vão voltar (K22):** o molde `assertAdminForPrivilegedTarget` do ban/lock não serve aqui — ele lê as features **efetivas** do alvo, e num alvo deletado todas as roles estão soft-deletadas, então o conjunto sairia vazio e o guard passaria sempre. O guard resolve o conjunto que de fato vai voltar (as nomeadas, ou as que morreram na cascata) e roda `assertAdminForRoleAssignment` em cada uma, **antes de qualquer escrita** — cobrindo os dois vetores (a conta *era* privilegiada / o ator *nomeou* uma role privilegiada) sem conceito novo.

**Furo pré-existente fechado junto (8.3):** `POST /users` aceitava `roleNames` e **nunca** rodava o guard de não-escalação — um manager criava uma conta já com a role `admin`, desviando de `POST /users/:id/roles/:roleId`, que o exige. Nascer com a role é ser atribuído a ela.

### Transversais

**Por que `PreviousEmail` parou de bloquear (D13, 8.6):** a reserva perpétua da 7.15 se justificava por um único argumento — "mesmo idioma do email preso de conta deletada". Esse idioma morreu na 8.4/8.5, quando o email preso ganhou caminho de volta por **verificação de posse**; manter a reserva do outro lado seria incoerente com o raciocínio que a criou. Passa a valer só o email **atual** de uma conta (inclusive deletada), que o `@unique` de `User.email` já garante sozinho. A liberação cobre os **três** call sites que produziam o mesmo 409 (signup de cliente, admin criando funcionário, `change-email`), não só o signup: manter um bloqueando reintroduziria a inconsistência, com o endereço livre por um caminho e preso por outro.

**Por que o `@unique` de `PreviousEmail.email` saiu junto (K25):** com o reuso liberado, o unique vira bomba-relógio. B larga o endereço X; A adota X; A troca de email de novo → o `previousEmail.create` da confirmação estoura P2002 e a troca de A falha com 409 **para sempre**, sem caminho de volta e sem que o usuário entenda o porquê. A tabela é histórico, e histórico se repete: o mesmo endereço pertence a várias contas ao longo do tempo, e uma conta pode voltar a um endereço que já largou. Sem `findPreviousEmailByEmail` (apagada), não sobrou nem leitura por email para o índice servir.

**Por que o rate limit dos fluxos novos vive no service, e não em middleware (8.7):** `rateLimitByEmailTarget` lê `req.body.email` **antes** do controller, e nenhum dos dois pontos novos cabe nisso — o signup só deve consumir no *ramo* de reativação (não em todo cadastro) e `POST /users/:id/reactivate` não recebe email nenhum no request. Em vez de duplicar o limitador, `enforce()` parou de depender de `res`: o 429 passou a carregar o `Retry-After` no próprio `AppError` (campo `headers`), aplicado pelo error handler central — que já era o ponto único de saída desde a 7.5. Isso é o que permite chamar `consumeEmailTargetLimit` de dentro de um service, que por camada não enxerga `Request`/`Response`.

**Por que o admin divide o balde com o `forgot-password` (K27):** o orçamento é do **email**, não do ator. Um balde separado para a rota autenticada somaria na caixa da mesma vítima e furaria a proteção que o limite por email-alvo existe para dar. O preço — um admin legítimo pode levar 429 porque um terceiro gastou o orçamento daquele endereço — é bloqueio temporário numa ação rara, e a `rule` no audit distingue a origem. No caminho do admin o consumo vem **depois** de todos os guards: pedido recusado não gasta orçamento alheio.

**Por que as três rotas públicas de token ganharam limite juntas (K26):** proteger só a rota nova de confirmação deixaria duas irmãs idênticas — públicas, consumindo token opaco — desprotegidas sem nenhuma razão de negócio que as distinga. Balde **próprio** (`tokenIpLimiter`), não o de envio de email: enviar email e consumir token são superfícies diferentes, e compartilhar faria um reset legítimo comer o orçamento do outro.

**Isenção do demo no lockout (8.8):** bug de produção sem relação com perfil/reativação, resolvido dentro desta fase — racional na §2.2 ("Adendo (Fase 8.8)") e no ADR `docs/adr/rate-limiting-and-lockout.md`.

---

## 2.7 Fase 9 (planejada) — domínio pet shop: pets e catálogo

> Planejada em 2026-08-06, a partir de uma sessão de brainstorming/decisão do usuário
> (`docs/planning/fase-9-contexto.md`). Passo-a-passo atômico e as pendências ainda em
> aberto no `docs/todo.md`; decisões estruturais nos ADRs `pet-domain-modeling.md`,
> `product-catalog-modeling.md`, `product-vs-service.md`, `text-search.md`,
> `file-storage-and-uploads.md` e num adendo em `pagination.md`. Esta seção registra só o
> "porquê" das decisões já fechadas — o "o quê" está no `todo.md`, o que ficou de fora com
> o racional de exclusão está no `docs/backlog.md`.

**Por que Bloco A (pets) + Bloco B (catálogo), sem checkout:** dos três recortes avaliados,
"só pets" ficava magro demais para o marco que o README já anuncia ("o Ciclo 2 abre o
domínio do pet shop"), e "loja virtual completa" (pets + catálogo + carrinho + pedido) foi
recusado porque o pedido depende de estoque, que depende de variante, que depende de
preço — uma cadeia longa demais para descobrir um erro de modelagem só no fim. As duas
agregações entregues só se tocam na faceta "para qual espécie este produto serve", o que
permite trabalhá-las em sequência sem que uma trave a outra.

**Por que espécie é enum sem `OUTRO`, e raça é tabela semeada por constante (nunca API em
runtime):** um enum fechado dá filtro confiável, relatório possível e dado que nasce
limpo — mesma escolha já feita em `UserStatus`/`ProfileKind`. `OUTRO` pareceria
flexibilidade, mas é um buraco permanente: o pet fica sem raça válida, fora de todo filtro
útil, e a pressão seguinte é criar um campo de texto livre, trazendo de volta pela porta
dos fundos o que o enum evitava — por isso a lista nasce deliberadamente mais larga que o
mínimo (`DOG, CAT, RABBIT, BIRD, RODENT, REPTILE, FISH`), e espécie nova é uma migration
barata (`ALTER TYPE ... ADD VALUE`). Para raça, consultar uma API pública em runtime
(TheDogAPI/TheCatAPI) colocaria a disponibilidade da própria API refém de um terceiro, não
daria um id estável para FK (empurrando `Pet.breed` de volta a string) e tem cobertura
ruim fora de cão e gato. A saída é puxar uma vez, curar à mão (pt-BR, sem duplicata) e
nunca mais consultar — manutenção dali em diante é edição da constante. `SPECIES_WITH_BREED`
é uma constante **explícita**, não derivada de "existe `Breed` para esta espécie": derivar
pareceria mais elegante, mas no dia em que alguém semeasse a primeira raça de peixe, todo
pet-peixe já cadastrado passaria retroativamente a violar a regra, sem que ninguém tivesse
mudado a regra de fato.

**Por que `deceasedAt` é separado de `deletedAt`:** falecido não é excluído. O pet morto
continua na lista do dono e todo o histórico futuro de prontuário permanece válido e
legível — excluir destruiria informação clinicamente relevante e emocionalmente
significativa. Pelo mesmo racional, dono único (`Pet.customerId` obrigatório, sem N:N) foi
mantido apesar de família compartilhando pet ser um caso real: o gatilho de revisão é
migrar para tabela de junção, registrado no backlog.

**Por que `Product` + `ProductVariant`, e não produto plano:** o caso motivador é concreto
— "Ração Golden Adulto" existe em 1 kg, 10,1 kg e 15 kg, com preço/estoque/código de barras
diferentes mas mesma descrição/marca/categoria. Produto plano (cada peso como produto
independente) faria a vitrine mostrar três cards do mesmo produto, "escolher o tamanho"
deixaria de existir como conceito, e o item do pedido da Fase 10 apontaria para algo que
não é a unidade real de venda — migrar depois seria caro. Todo produto nasce com ≥1
variante (mesmo "sem variação" ganha uma variante única `isDefault`) para não abrir dois
caminhos de preço (produto com preço próprio × produto com variantes), fonte clássica de
bug em catálogo.

**Por que espécie é faceta do produto e categoria é função ("o problema da cama"):** uma
cama de pet serve cães e gatos — modelar "Cães > Camas" e "Gatos > Camas" como categorias
diferentes faria **toda** categoria folha se duplicar por espécie, e a árvore viraria um
produto cartesiano que cresce a cada espécie nova. Separando as dimensões
(`Product.targetSpecies: PetSpecies[]` fora da árvore de `Category`), a cama que serve aos
dois vira uma linha só com `[DOG, CAT]`, e a navegação por espécie (`?species=DOG`) e por
categoria (`?category=camas`) se combina no filtro, onde a combinatória é barata. Array
vazio significa "serve a qualquer espécie" — evita listar todas as espécies num produto
genérico e não quebra quando uma espécie nova entra no enum. Categoria e tag são N:N
(categoria com mínimo de uma — tapete higiênico é higiene e é adestramento; tag sem
mínimo, para o transversal e volátil: "promoção", "filhote").

**Por que características da variante são colunas fixas, não EAV nem JSON:** EAV
(`Attribute`+`ProductAttribute`) dá flexibilidade cadastrável pelo funcionário ao custo de
filtro sofrível, tipagem impossível e junções em tudo — contra o valor central do projeto,
que é tipagem estrita. JSON é meio-termo que funciona no Postgres mas sai do conforto do
Prisma e do Zod, e deixa o dado se sujar sem que nada reclame. Colunas fixas
(`weightGrams`/`volumeMl`/`sizeLabel`) cobrem a esmagadora maioria dos casos de pet shop
com uma fração da complexidade; atributo novo é migration, barata e explícita; tags
absorvem o resto.

**Por que preço em centavos:** elimina de uma vez a classe de bug de ponto flutuante, é o
formato que gateways de pagamento usam, e evita o `Decimal` do Prisma, que chega como
objeto e contamina serialização/Zod/comparação — mesmo racional já vale para
`weightGrams` do pet. Moeda fica implícita (BRL) até existir motivo para uma coluna.
`costCents` é dado interno e nunca aparece na view do cliente — é o que motiva a view por
capability do catálogo.

**Por que status do produto (`DRAFT/ACTIVE/DISCONTINUED`) coexiste com soft delete:**
respondem perguntas diferentes. Um produto descontinuado não está excluído — tem histórico
de venda e pode voltar; `deletedAt` continua sendo o soft delete de sempre (erro de
cadastro, duplicata). Views por capability (presenter Zod, já existente) resolvem "cliente
não vê custo/estoque interno/produto fora de venda" sem risco de vazamento — mesma
ferramenta que já protege `passwordHash` no módulo de usuário. Expor **disponibilidade**
(booleano derivado) em vez de quantidade exata ao público é decisão consciente: quantidade
é informação competitiva e não muda nada para quem compra.

**Por que produto e serviço ficam em tabelas separadas (decisão herdada pela Fase 10, mas
tomada agora):** o app, no longo prazo, vende produtos e serviços (banho, tosa, consulta),
e o custo de errar essa modelagem só aparece na Fase 10, no item do pedido — quando alguém
compra 1 saco de ração e 1 banho, o pedido tem dois itens e o banco não tem FK que aponte
para duas tabelas. `kind` único (`Product.kind = PRODUCT | SERVICE`) daria FK única e
carrinho sem ramificação, mas a tabela viraria metade colunas nulas (serviço não tem peso
nem estoque; produto não tem duração nem profissional executante) e a validação
"obrigatório se `kind = SERVICE`" migraria do banco para o código — uma armadilha
confortável. Supertipo com PK compartilhada (*class table inheritance*) seria mais correto
academicamente, mas custaria uma junção a mais em **toda** leitura de catálogo — a parte
mais usada do sistema — e duas escritas coordenadas em todo cadastro. A escolha (tabelas
separadas + `OrderItem` polimórfico com CHECK constraint escrito à mão, garantindo que
exatamente um de `productVariantId`/`serviceId` está preenchido) paga junção e cerimônia
só na Fase 10, no ponto de menor tráfego, não no de maior.

**Por que busca textual no Postgres nativo (`tsvector`+`unaccent`+`pg_trgm`), e não
`ILIKE` nem Meilisearch/Typesense:** decisão do usuário, explicitamente contra a
recomendação inicial (que era começar com `ILIKE`), com motivação didática — o objetivo
declarado é aprender a construir busca com tolerância a erro de digitação, não entregar o
mínimo que funciona. Não existe biblioteca Node que resolva tolerância a typo; a resposta
de mercado quando o volume justifica é Meilisearch/Typesense, descartados aqui porque
custam um container a mais, um pipeline de sincronização produto→índice e uma segunda
fonte de verdade que pode divergir do Postgres (gatilho de revisão registrado no ADR).
Armadilhas técnicas conhecidas, documentadas para não custarem uma tarde cada: `unaccent`
não é `IMMUTABLE` (coluna gerada exige função imutável — resolve com wrapper ou trigger);
extensões (`unaccent`, `pg_trgm`) exigem `CREATE EXTENSION` em migration escrita à mão, o
Prisma não as declara, e isso afeta dev/test/prod igualmente; sem índice GIN a busca
funciona e é lenta, e a lentidão só aparece com volume, depois do deploy;
`websearch_to_tsquery` é preferível a `to_tsquery` (não explode com sintaxe inválida); o
limiar de similaridade do `pg_trgm` é sessão-scoped, e com pool de conexões precisa ser
definido por query. SQL cru para isso vive só no repository, via `$queryRaw`
parametrizado — o corte de camadas se mantém mesmo quando a ferramenta é SQL puro.

**Por que upload em disco local atrás de um adaptador, e não S3/R2 direto:** restrições do
usuário — hospedagem própria, VPS ARM64, custo zero — mais a intenção declarada de
aprender como upload funciona de verdade. O adaptador (`put`/`delete`/`url`, implementação
`LocalDiskStorage`) mantém o service alheio à existência de disco; trocar por storage
externo no futuro é uma classe nova e uma env var, o mesmo corte que o repository já faz
com o Prisma. O reverse proxy serve os arquivos como estático, sem passar por Node,
poupando o processo da app do custo de servir binário. O ambiente demo público é o ponto
de atenção maior — upload aberto na internet é abuso de disco garantido — daí a role
`demo` sem acesso de escrita a upload, `demo-reset` passando a limpar o diretório, e rate
limit próprio agressivo para o endpoint.

---

## 3. Schema — pontos de atenção

- **User**: id, name, cpf @unique, email @unique, passwordHash, createdAt, updatedAt, deletedAt?. Relações: employee?, customer?, roles[], features[], sessions[].
- **Session** (Fase 3): id, userId, refreshTokenHash @unique, usedAt?, invalidatedAt?, expiresAt, userAgent?, ipAddress?, createdAt. Sem campo `token` (era o design antigo, validado no banco a cada request) — o access token é um JWT stateless, validado só localmente por assinatura+expiração; só o refresh (opaco, hash salvo) toca essa tabela, e só em `/refresh`, `/logout` e nos endpoints de sessão.
- **Customer/Employee**: id, userId @unique, deletedAt?, campos próprios (Customer: phone obrigatório, address?, birthDate?; Employee: hiringDate @default(now())). `onDelete: Cascade` no user.
- **UserRole/UserFeature**: `id @id @default(uuid())` (NÃO par composto — mudou para soft delete), deletedAt?. UserFeature: granted, grantedAt @default(now()), updatedAt @updatedAt.
- **Role**: code-seeded, description obrigatória, `appliesTo ProfileKind` — **NOT NULL** desde o Passo 0 da Sessão B da Fase 8 (o catálogo nunca produziu `null`, e três branches mortos sustentavam esse estado). **Feature**: code-seeded.
- ~~Unicidade de override/role ativo: garantida por código (busca ativo → update/create), não por constraint SQL.~~ **Superado na Fase 8.0** — ver abaixo.

**Mudanças da Fase 7** (o *porquê* está na §2.2, aqui só o que as tabelas viraram):

- **7.6** — model **`AuditLog`** (`id`, `action`, `actorId?`, `targetType`, `targetId?`, `metadata`, `ip?`, `userAgent?`, `createdAt`). `actorId`/`targetId` são **uuid cru, sem FK** — evidência precisa continuar apontando para linha soft-deletada, mesmo idioma do `User.bannedBy`. Índices: `(createdAt, id)` (a chave do cursor de `GET /audit-logs`), `action`, `actorId`, `targetId`. Append-only: a aplicação nunca faz update/delete; só o script de retenção apaga.
- **7.15** (`add_email_change_and_previous_emails`) — `VerificationPurpose` ganhou `EMAIL_CHANGE`; `VerificationToken` ganhou `newEmail String?` (coluna usada só nesse purpose — o token carrega o próprio alvo); `User` ganhou `pendingEmail String? @map("pending_email")`, **não-único**; tabela nova **`PreviousEmail`** (`id`, `userId` FK, `email`, `replacedAt`, `createdAt`, `@@index([userId])`) — o `@unique` global que a coluna `email` tinha saiu na 8.6.
- **7.16** (`add_must_change_password`) — `User.mustChangePassword Boolean @default(false) @map("must_change_password")`.

**Mudanças da Fase 8** (o *porquê* está na §2.6, aqui só o que as tabelas viraram):

- **8.0** — `UserFeature.userId` → **`userRoleId`** (FK para `UserRole`, `onDelete: Cascade`) + `@@unique([userRoleId, featureId])`; `UserRole` ganhou `grantedAt` e `@@unique([userId, roleId])`. `User.features` deixou de existir como relação — overrides são alcançados por `User.roles[].features[]`. A migration **zerou o banco** (D10): o único ambiente no ar era o demo de portfólio, sem dado real a preservar, o que permitiu trocar o dono do override sem backfill nem migration em duas etapas.
- **8.4** — `VerificationPurpose` ganhou `ACCOUNT_REACTIVATION`; `VerificationToken` ganhou `restoreProfiles ProfileKind[]` e `restoreRoleIds String[]` (colunas de um purpose só, idioma do `newEmail` da 7.15). `restoreRoleIds` **vazio significa o default do D8** — todas as roles que morreram na cascata.
- **8.6** — o `@unique` de `PreviousEmail.email` **saiu** (migration de uma linha); o `@@index([userId])` ficou. A tabela continua existindo como histórico.
- Nenhuma coluna de "motivo de deleção" foi criada: a correlação da restauração é o próprio `deletedAt` (D4/D5).


**Roles** (em `role.constants.ts`): customer (CUSTOMER), attendant/manager/admin (EMPLOYEE). admin tem `["*"]`. Compostas por grupos semânticos (SELF_MANAGEMENT, USER_ADMINISTRATION, PERMISSION_FEATURES) deduplicados via `[...new Set()]`. `DEFAULT_ROLES as const satisfies readonly RoleDefinition[]`.

**PERMISSION_FEATURES**: read:feature, read:role, read:permission, manage:permission.

**Fase 4 (implementada):** `User` ganhou `status UserStatus @default(PENDING)` (`enum UserStatus { PENDING, ACTIVE }`) + `bannedAt?`/`bannedBy?`/`banReason?` (ban ortogonal ao status). Model `VerificationToken` (id, userId, tokenHash @unique, purpose, expiresAt, usedAt?, createdAt, `onDelete: Cascade`) + `enum VerificationPurpose { EMAIL_VERIFICATION, PASSWORD_RESET }` — mesmo padrão hash-do-token da `Session`. Feature `manage:user:status` em `USER_ADMINISTRATION_FEATURES`. `clearDatabase` limpa `verificationToken` antes de `user`. Migration aplicada em dev+teste (backfill `status='ACTIVE'` para linhas pré-existentes).


---

## 4. Histórico de versões deste contexto
Esta versão consolida o ciclo 1 até o ponto: CRUD de user, soft delete (user/perfil/override/role), módulos role e permission, POSTs de perfil completos, DELETEs de perfil completos (customer e employee) — inclusive remoção seletiva de roles por `appliesTo`, transação atômica, e recusa de deleção do último perfil ativo. Feature `delete:profile` adicionada a `USER_ADMINISTRATION_FEATURES`. Vínculo user↔role completo (`GET`/`POST`/`DELETE` em `/api/v1/users/:userId/roles`), com `toRoleDTO` centralizando o shape de resposta (extraído de `role.service.ts`, reusado em `/roles` e `/users/:userId/roles`) e não-escalação generalizada (`assertAdminForRoleAssignment`) cobrindo atribuição e revogação de roles privilegiadas.

**Fase 3 (fechada):** auth migrada de "1 JWT guardado como Session, validado no banco a cada request" para "access JWT 15min validado localmente + refresh opaco rotativo em `Session`, só tocado em `/refresh`". `authenticate` saiu de global para por-grupo-de-rota; `logout`/`GET`/`DELETE /auth/sessions` aplicam `authenticate`+`canAccess` na própria definição de rota. Endpoints: `login` (sempre cria `Session` nova, sem o quirk de reuso antigo), `refresh` (rotação + detecção de roubo via reuso de token), `logout` (por refresh token + ownership), `GET /auth/sessions` (lista só sessões vivas), `DELETE /auth/sessions/:id` (revogação pontual, 404 unificado pra "não existe" e "existe mas está morta"). No fecho da fase, uma auditoria geral confirmou o resto do app coerente com a mudança e corrigiu dois achados que não eram objetivo original da fase: `canAccess.middleware.ts` migrado de `res.json` cru para `create*Error` (o mesmo padrão já fechado para `authenticate` nesta fase, mas que não tinha sido estendido a `canAccess`), e `refreshSessionSchema` (código morto, pré-datava o design atual) removido. Também foi adicionado um teste de integração ponta-a-ponta (signup real → login → rota protegida → refresh → sessions → logout) e reativados dois testes de regressão em `permission.test.ts` que estavam comentados desde antes da fase por causa de um import de `prisma` faltando (sem relação com a Fase 3, mas achado durante a mesma auditoria).

**Fase 4 (fechada):** status de conta com verificação de email obrigatória (`status PENDING → ACTIVE` via `POST /auth/verify-email`; só `ACTIVE` loga), ban ortogonal ao status (`bannedAt`/`bannedBy`/`banReason`), serviço de email genérico (`src/lib/email.ts`, nodemailer; mailpit em dev via docker, Resend em prod), recuperação de senha (`forgot`/`reset`, anti-enumeração + invalidação total de sessões), troca de senha logado single-step (só senha atual), e banimento (`POST`/`DELETE /users/:id/ban`, feature `manage:user:status`, proteção de privilegiado via `assertAdminForBan`, conta congelada incluindo reset/change). Orquestração em `verification.service.ts` e `password.service.ts` (anti-ciclo). Racional completo na seção 2.1; passo-a-passo no `docs/todo.md`. Também nesta fase nasceu o `docs/endpoints.md`. Fechos (4.5): 2 bugs pré-existentes corrigidos — `getUserById` passou a autorizar antes de buscar (403 vence 404, não vaza existência de id) e o error handler passou a mapear corpo JSON malformado do body-parser para **400** (antes 500). Adotado o fluxo de branches por fase (`main` → `fase-<n>` → `feat/fase-<n>-<m>-<slug>`).

**Fase 5 (fechada):** documentação da API + containerização, fechando o Ciclo 1 como peça de portfólio (nenhuma regra de negócio nova). OpenAPI 3.1 gerado dos próprios schemas Zod via `.meta()` nativo (`src/docs/`, `zod-openapi`) → **`GET /openapi.json`** + UI Scalar interativa em **`GET /reference`** (ambas públicas, no router de topo) → coleção **Bruno** versionada em `api-collection/` (por módulo, environments `local`/`prod`). Usuário **demo read-only** (role `demo` sempre semeada; usuário só com `SEED_DEMO_USER=true`) — leitura 200 / escrita 403, RBAC ao vivo. Containerização full-stack: `Dockerfile` multi-stage não-root, `docker compose` com o serviço `app` sob profile `full` (dev via `services:up` intacto, app no host via tsx), entrypoint `migrate deploy → seed → start`, seed **bundlado** pelo tsup (`dist/seed.js`, sem tsx/src no runtime), app derivando a própria `DATABASE_URL` (`@db`). Scripts `stack:up`/`stack:down`/`db:deploy`. Racional completo na seção 2.3; nesta fase nasceu o `README.md`.

**Fase 6 (fechada):** reformulação de ambientes (dev/test/prod), sem regra de negócio nova — motivada por dois bugs de deploy (app hardcodado no mailpit em vez da Resend; prod subindo db/mailpit de dev). Compose **base + overrides** por ambiente (isolados por `-p pet-oasis-{dev,test,prod}`, container/volume/porta distintos), envs por arquivo (`.env.{development,test,production}` fora do git + `.env.example`) com `env_file` nos containers e `dotenv-cli`/`vitest.config` no host, boot determinístico via `migrate deploy`, **graceful shutdown** (`src/lib/shutdown.ts`, SIGTERM/SIGINT, PID 1 via `exec`) e stage `dev` no Dockerfile (tsx watch por bind-mount, client Prisma em volume anônimo). Scripts `dev`/`prod:up`/`test` por ambiente (o profile `full` e os `services:*`/`stack:*`/`db:test:*` foram removidos). Racional completo na seção 2.4 e no ADR `docs/adr/environments-and-deploy.md`. A antiga "§2.2 Fase 5 (planejada)" (rate limiting, lockout, audit log) foi renumerada de "Fase 6 (planejada)" para **"Fase 7 (planejada)"** ao inserir esta fase de infra entre a 5 e a de hardening.

**Fase 7 (fechada):** hardening + observabilidade, em 9 sessões de trabalho (A–I). **Segurança:** Redis para rate limit (por IP + por email destinatário) e account lockout (janela fixa → backoff exponencial), fail-open explícito em ambos quando o Redis cai, helmet com CSP estrita (Scalar auto-hospedado + nonce por request), CORS explícito, os 3 guards de escalação consolidados em `assertActorIsAdmin`, corpo grande demais virando 413 (não mais 500). **Observabilidade:** três categorias de log (access/application/audit) sobre `pino` + `AsyncLocalStorage`, taxonomia fechada de audit (18 ações à época, 24 hoje) com regra de PII (só ids/enums), endpoints de leitura (`GET /audit-logs` com IP mascarado sem `read:audit-log:full`, `GET /logs/recent` sobre o ring buffer), Axiom (worker thread) e Sentry (só falha ≥500) opcionais por env var, timeouts em toda dependência externa (HTTP server, Prisma, Redis, SMTP). **Higiene:** paginação reutilizável (offset + cursor) com envelope `{ data, meta }` em todas as listagens, teto de sessões vivas + scripts de faxina (`cleanup-sessions`/`cleanup-audit-log`) agendados via systemd timer, reset diário do ambiente demo (truncate+reseed sob `DEMO_MODE`). **Polimento de conta** (Sessão H, desenho confirmado com o usuário em 2026-08-03): troca de email em 2 passos com `PreviousEmail` reservado para sempre (🔸 revertido na 8.6 — ver §2.6), reset de senha forçado pelo admin (bloqueia login até o reset), `GET /auth/sessions` com `device` parseado do user-agent e `current`. **Fecho (7.19, sem regra de negócio nova):** teste de regressão do refresh token hasheado (D1 — já implementado desde a Fase 3) e sincronização de toda a documentação da fase (`docs/endpoints.md`, `docs/logging-policy.md`, ADRs, `docs/backlog.md`, `README.md`) com o que as sub-fases de fato entregaram. Racional completo na seção 2.2, `docs/logging-policy.md` e nos ADRs `rate-limiting-and-lockout.md`/`pagination.md`.
**Fase 8 (fechada):** autorização com escopo, cascata de deleção e reativação de conta, em 7 sessões (A–G). **É a única fase implementada, revertida e refeita** — o desenho original construiu a reativação em cima de dois bugs pré-existentes (deleção que não cascateava; override sem escopo) e foi revertido para `d1b8478` em 2026-08-07, com o escopo ampliado para consertar o modelo antes de construir sobre ele. **Modelo (8.0):** o override passou a pendurar na `UserRole` (D2), `UserRole` ganhou `@@unique([userId, roleId])` com reuso de linha (D3) e o contrato virou `PUT|DELETE /users/:userId/roles/:roleId/features/:featureId` (D9). **Ciclo de vida (8.1/8.2):** deleção cascateia quatro níveis com **um único timestamp por transação** (D1/D4) e restauração correlaciona por `deletedAt`; a restauração **para na role** (D6', Sessão C — matou o D16 junto) e o perfil volta por ser **nomeado**, não por correlação (K20, Sessão D). **Fluxos (8.3/8.4/8.5):** uma rota que cria **ou** reativa perfil, com catálogo de features nomeando o recurso (`create:customer-profile`); conta deletada volta por signup (202, self-service só traz cliente — D11) ou por `POST /users/:id/reactivate` (admin escolhe perfis e roles), sempre confirmada pelo dono via token com senha nova. **Transversais (8.6/8.7/8.8):** `PreviousEmail` parou de bloquear e perdeu o `@unique` (D13/K25), rate limit cobriu as superfícies novas e as três rotas públicas de token (K26/K27), e a conta demo ficou isenta do account lockout (bug de produção). **Fecho (8.9, sem regra de negócio nova):** consolidação do racional na §2.6 e no ADR novo `authorization-scope-and-lifecycle.md`, sincronização de `CLAUDE.md`/`endpoints.md`/`logging-policy.md`/`README.md` com o que a fase entregou, e dissolução do documento de trabalho `docs/fase-8-redesign.md`. Racional completo na seção 2.6 e no ADR.
