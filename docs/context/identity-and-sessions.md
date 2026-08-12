# Identidade e sessões — auth, status de conta, email e senha

> Tudo que diz respeito a *quem é o usuário e se ele pode entrar*: o desenho de sessão
> (access JWT + refresh rotativo), o status da conta, verificação e troca de email, senha e
> banimento. Revogação de token tem ADR próprio:
> [`auth-token-revocation.md`](../adr/auth-token-revocation.md).

---

## Sessão e refresh

### Design de `Session` — access JWT 15min + refresh opaco rotativo

Cada linha de `Session` representa **um token de refresh emitido**, não uma "sessão" no sentido
de família de dispositivo — não existe id de família agregando rotações sucessivas do mesmo
login. Um login cria uma linha; cada rotação bem-sucedida em `/refresh` marca a antiga com
`usedAt` e cria uma nova (mesmo `userId`, hash novo).

Três campos, três formas independentes de uma sessão morrer:

- `usedAt` — já foi trocada por uma rotação; reuso dela é sinal de roubo
- `invalidatedAt` — revogada explicitamente (logout, revogação pontual, resposta a roubo)
- `expiresAt` — TTL de 7 dias, deslizante a cada rotação

"Sessão viva" = as três condições simultaneamente
(`usedAt IS NULL AND invalidatedAt IS NULL AND expiresAt > now()`) — é o filtro de
`findLiveSessionsByUserId`, base de `GET /auth/sessions` e de `revokeSession`, que trata "não
encontrada" e "encontrada mas morta" com o **mesmo 404 genérico**, sem vazar qual dos dois
aconteceu.

### Ordem de checagem no `refresh`: reuso → invalidada → expirada

Sempre a mesma mensagem 401 genérica nas três (não revela qual checagem falhou). A ordem importa:
`usedAt` é checado primeiro porque é o único caso que dispara **efeito colateral** — replay de um
token já usado aciona `invalidateAllUserSessions(userId)`, matando **todas** as sessões do usuário
(não só a reutilizada), já que reuso é o sinal mais forte de que o refresh token vazou e o
dispositivo legítimo não é mais o único de posse dele.

**Nota de consistência:** `invalidateAllUserSessions` (resposta a roubo) e
`softDeleteUserAndInvalidateSessions` (usuário deletado) usam `where` diferentes de propósito. A
primeira invalida por `invalidatedAt: null, expiresAt: { gt: now }` **sem** excluir `usedAt`,
porque numa resposta a roubo o objetivo é marcar `invalidatedAt` em toda sessão para auditoria
completa, inclusive as já usadas. A segunda inclui `usedAt: null`, porque ali o objetivo é só
limpar sessões que ainda poderiam ser usadas — não é resposta a incidente, é encerramento de conta.

### Refresh token hasheado em repouso — item que virou teste, não código

Levantado na Fase 7 e, na análise, **já estava implementado desde a Fase 3**:
`Session.refreshTokenHash` guarda `sha256(token)` (`src/lib/token.ts`), e o token opaco nunca é
persistido em plaintext. A comparação em tempo constante que o item pedia também não se aplica: o
lookup é `findUnique` pelo hash, não comparação byte a byte de segredo. Restou formalizar em
regressão (`auth.test.ts`): a coluna nunca é igual ao token cru do cookie — e é igual a
`hashToken(token cru)` —, e um token adulterado por um caractere devolve 401.

Trocar o sha256 por HMAC com `PEPPER` foi considerado e **recusado**: com token de 32 bytes de
entropia não há dicionário a montar, o ganho é marginal, e o custo seria uma migration invalidando
todas as sessões vivas — registrado no [backlog](../reference/backlog.md) caso o cenário mude.

### Teto de sessões vivas

Ver [observability.md](observability.md#teto-de-sessões-e-faxina-de-tokens-são-higiene-não-perda-de-auditoria)
— é higiene, não auditoria.

---

## Status da conta

### Status e ban são ortogonais

`enum PENDING/ACTIVE` + `bannedAt`, não `enum PENDING/ACTIVE/BANNED`. Um único enum obrigaria banir
a sobrescrever `PENDING`/`ACTIVE`, e desbanir teria que adivinhar para onde voltar (um `PENDING`
banido volta pra quê?). Ban como timestamp-flag separado (`bannedAt`/`bannedBy`/`banReason`) —
mesmo idioma de `deletedAt`/`usedAt`/`invalidatedAt` — mantém o `status` de verificação intacto
durante o ban: desbanir é limpar as três colunas e a conta volta exatamente ao estado anterior. A
regra de login vira conjunção explícita: `status == ACTIVE && bannedAt == null`.

### Todo usuário nasce PENDING, inclusive os criados por admin

O objetivo da verificação é provar que o email é válido e pertence à pessoa. Isso vale igual para o
funcionário criado por um admin. Uma regra única ("todo mundo verifica") evita um `status`
condicional por origem de criação e não abre exceção que depois vira dívida. O custo — um passo de
verificação para contas internas — é aceito.

### 403 (não 401) no login quando a senha está certa mas a conta não está ACTIVE

Senha errada é 401 genérico (não se sabe quem é). Uma credencial correta **estabelece a
identidade** — o que falta é permissão de entrar, semanticamente 403. Mensagens distintas (PENDING
→ "verifique seu email"; BANNED → "conta suspensa, contate o suporte") orientam o dono. Trade-off
aceito: o 403 revela que a senha estava correta, mas quem chegou até aqui provou posse da senha.

### Anti-enumeração em forgot / resend / signup

`forgot-password` e `verify-email/resend` respondem **sempre 200 genérico**, independentemente de o
email existir, estar ACTIVE ou banido — senão a resposta viraria oráculo de "quais emails têm
conta". O email real só sai quando a condição interna é satisfeita. No mesmo espírito, signup com
email de um banido mantém o **409 genérico** já produzido pelo `@unique` (a linha do banido
persiste, não é deletada), sem mensagem especial.

---

## Ban — a conta congelada

### Ban reusa a âncora admin da não-escalação

Banir/desbanir usa `manage:user:status` (em `USER_ADMINISTRATION_FEATURES`, logo manager e admin a
têm), mas banir/desbanir um alvo **privilegiado** exige role **admin** — sem isso um manager
neutralizaria um admin banindo-o (escalação lateral). Ban também invalida as sessões do alvo no
ato: um banido não deve seguir usando o access token até expirar.

### O guard do ban difere do de role, e auto-ban é 409

`assertAdminForBan` identifica o alvo privilegiado computando as features **efetivas do
usuário-alvo** (`getUserForFeatureComputation` + `computeEffectiveFeatures`, checando `*` /
`PERMISSION_FEATURES`) — diferente de `assertAdminForRoleAssignment`, que olha as features da
*role* sendo atribuída. Banir/desbanir a si mesmo é **409** (evita um admin se trancar para fora;
é o único caso alcançável, já que manager/attendant caem antes no guard de privilegiado, porque
manager tem `PERMISSION_FEATURES`). Ban seta as três colunas + invalida sessões numa transação;
unban limpa as três e preserva o `status`.

### "Conta congelada" cobre também reset e change

Banido não faz **nada** com a conta: login bloqueado (403), forgot/reset e resend-verification viram
no-op (200 genérico, nenhum email sai), sessões vivas derrubadas. Além de login/forgot/resend,
`reset-password` (com token válido) e `change-password` (com Bearer válido) também recusam dono
banido com **403** — fecha a brecha de um token emitido enquanto a conta estava ativa ser usado logo
após o ban. O ban é estado terminal, reversível só por desban de um admin.

---

## Verificação de email

### `/auth` sem feature

Verificação, forgot e reset são operações self-service, no mesmo grupo público de
`login`/`signup`/`refresh` — quem as usa por definição ainda não está autenticado (ou age sobre a
própria identidade). O recurso central de cada uma é o **token**, não um recurso de domínio, por
isso `POST /auth/verify-email`, `/forgot-password`, `/reset-password` em vez de aninhar em
`/users/:id`. `change-password` é a exceção autenticada: exige `authenticate` mas nenhuma feature,
porque é o dono agindo na própria conta, travado pela senha atual.

### Um `VerificationToken` genérico, com `purpose`

Email-verification e password-reset compartilham exatamente a mesma forma (token opaco, hash
SHA-256 salvo, `expiresAt`, `usedAt`, `userId`) — só mudam finalidade e TTL. Um model com `purpose`
evita dois repositórios quase idênticos. Reusa `hashToken` de `src/lib/token.ts` (mesmo padrão do
refresh: guarda só o hash, entrega o cru ao usuário). `change-password` não usa esse model: não há
token, a prova é a senha atual. O enum cresceu depois com `EMAIL_CHANGE` (7.15) e
`ACCOUNT_REACTIVATION` (8.4).

### Só a criação de usuário emite verificação — os POSTs de perfil não

A emissão mora em `user.service.createCustomer`/`createEmployee`, que cobre os dois caminhos que
criam usuário novo (signup e `POST /users`). `POST /users/:id/customer|employee` **não** emite:
adiciona um 2º perfil a um usuário que já existe (já tem `status` e já recebeu o email) —
re-emitir ali geraria ruído sem provar nada de novo. Verificação é sobre a identidade do email, que
não muda ao ganhar um perfil.

### Token inválido/expirado/usado é 400 genérico

O token é sintaticamente válido (passou no Zod) mas imprestável: não é erro de validação de campo
(o 422 do projeto carrega `errors` por campo, que não encaixa num token opaco) nem credencial de
sessão (401 é para Bearer/refresh). É um `createBadRequestError` que **não vaza qual** condição
falhou (inexistente × expirado × usado). Sucesso → **204**, idioma do projeto para ação sem corpo.
O mesmo vale no `reset-password`.

### A orquestração vive em `verification.service.ts`, não em `auth.service`

`auth.service` já importa `user.service` (para o signup), e `user.service` precisa disparar a
emissão na criação — pôr a emissão em `auth.service` fecharia o ciclo
`user.service → auth.service → user.service`. `verification.service.ts` concentra
`issueEmailVerification`/`verifyEmail`/`resendVerification` importando só `auth.repository`,
`user.repository`, `lib/email` e `lib/token`. O gate de login continua em `auth.service.login` (só
lê `user.status`/`user.bannedAt`, que já vêm no `findUserByEmail`). Análogo: senha vive em
`password.service.ts`, mesma razão de coesão e anti-ciclo.

---

## Senha

### Reset e change invalidam TODAS as sessões

Trocar a senha é o ponto natural de "expulsar quem não deveria estar". Se a senha vazou, invalidar
tudo (reusa `invalidateAllUserSessions`) corta o invasor imediatamente, em vez de esperar o refresh
expirar (7 dias). Vale para reset (não logado) e change (logado — o próprio usuário reloga; atrito
aceito pela garantia).

### Change-password é single-step, sem código por email

O usuário já está logado; exigir a senha atual já protege contra sessão sequestrada (um invasor com
o access token não sabe a senha). Um segundo fator por email para usuário logado seria mais atrito
que segurança — descartado. Contraste: o reset, para usuário **não** logado, precisa do token por
email porque não há outra prova de identidade. Sucesso dos dois → **204**; token de reset ruim →
**400**; `newPassword` fraca → **422** (reusa `passwordSchema`).

### Senha atual errada no change é 403, não 401

A request já está autenticada (Bearer válido) — um 401 seria lido pelo front como "token expirou" e
dispararia refresh/logout indevido. O que falhou foi a prova da senha atual (re-autenticação para
ação sensível), semanticamente 403. Contraste: no login, senha errada é 401 porque ainda não há
identidade estabelecida.

### Forçar troca de senha bloqueia o login inteiro

Um admin força esse reset justamente porque a senha atual pode estar comprometida. Deixar essa
senha completar o login — mesmo que só para cair numa tela de "troque agora" — daria a quem tiver a
senha (inclusive um atacante) uma sessão válida antes da troca, anulando o motivo do reset. O único
caminho de volta é o link por email, mesmo desenho do `forgot-password`; só a origem do token muda
(admin em vez do usuário), e `resetPassword` só ganhou um passo: limpar `mustChangePassword` ao
consumir o token.

### A checagem de `mustChangePassword` entra depois do `bannedAt` e antes do `status`

Banimento é a decisão mais severa e terminal (um humano cortou o acesso de propósito);
`mustChangePassword` é recuperável via email. Se as duas coexistirem (conta banida **e** com reset
forçado pendente, ex. durante investigação), a mensagem de banido é a que aparece, porque é a
informação dominante para quem tenta entrar.

### O admin dispara o email de reset na hora

Reaproveita o `buildPasswordResetEmail` existente e some com a ambiguidade de "por que fui deslogado
e não consigo mais entrar" — o usuário recebe o porquê e o link no mesmo momento em que a sessão cai.

---

## Troca de email

### Dois passos, e o alvo mora no token

`pendingEmail` existe para exibição (`GET /me`) e para o `PATCH /users/:id` continuar recusando
email (que passa a ter endpoint dedicado). A verdade sobre **qual** email um token confirma vive na
própria linha do `VerificationToken` (`newEmail`): se dependesse de reler `pendingEmail` no confirm,
um usuário que pedisse a troca duas vezes seguidas (A depois B) poderia ter o link antigo (de A)
confirmando B, porque a coluna já teria sido sobrescrita.

Uma nova chamada de `change-email` invalida o token anterior e sobrescreve `pendingEmail` — mesmo
idioma de "unicidade do ativo por código" — e isso dobra como **mecanismo de cancelamento**: o dono
real, se ainda souber a própria senha, sobrescreve uma troca maliciosa pedindo a troca de volta para
o próprio email.

### O endpoint de troca revela conflito (409), o `forgot-password` não

`forgot-password` é anônimo — qualquer um poderia testar emails para descobrir quais existem, então
a resposta é sempre genérica. `change-email` exige a senha atual da própria conta; para abusar do
409 e enumerar, seria preciso já ter comprometido essa conta, ponto em que enumerar emails de
terceiros é o menor dos danos. Mesma lógica que já vale para o signup.

### O aviso de segurança vai para o email antigo, no pedido — não na confirmação

O cenário que essa notificação cobre é sessão/senha comprometida. Nele, o atacante tem a senha mas
não necessariamente a caixa antiga — então é o dono real, ainda com acesso a ela, quem recebe o
aviso. Mandar só depois de confirmada a troca chegaria tarde demais para reagir; mandar no pedido é
a única janela em que a troca ainda não é definitiva.

### `PreviousEmail` reservava o endereço para sempre — e parou de reservar (D13, 8.6)

A reserva perpétua nasceu na 7.15 com um argumento só: "mesmo idioma do email preso de conta
deletada" — sem ela, alguém que reconquistasse uma caixa antiga poderia se cadastrar do zero se
passando pelo dono original. Esse idioma **morreu na 8.4/8.5**, quando o email preso ganhou caminho
de volta por verificação de posse; manter a reserva do outro lado seria incoerente com o raciocínio
que a criou. Passa a valer só o email **atual** de uma conta (inclusive deletada), que o `@unique` de
`User.email` já garante sozinho. A liberação cobre os **três** call sites que produziam o mesmo 409
(signup de cliente, admin criando funcionário, `change-email`) — manter um bloqueando reintroduziria
a inconsistência, com o endereço livre por um caminho e preso por outro.

A tabela continua existindo como **histórico**: ser tabela (não array em `User`) segue o idioma de
`AuditLog`/`VerificationToken` — cada entrada tem timestamp próprio, é indexável e sobra espaço para
metadado futuro.

### O `@unique` de `PreviousEmail.email` saiu junto (K25)

Com o reuso liberado, o unique vira bomba-relógio: B larga o endereço X; A adota X; A troca de email
de novo → o `previousEmail.create` da confirmação estoura P2002 e a troca de A falha com 409 **para
sempre**, sem caminho de volta e sem que o usuário entenda o porquê. Histórico se repete: o mesmo
endereço pertence a várias contas ao longo do tempo, e uma conta pode voltar a um endereço que já
largou. Sem `findPreviousEmailByEmail` (apagada), não sobrou nem leitura por email para o índice
servir.

---

## Email como serviço

`send({to, subject, html, text})` em `src/lib/email.ts` não sabe de verificação/reset — recebe o
email pronto. Isso o deixa reusável para o que vem depois (lembretes de agendamento, confirmações de
serviço/venda). Transporter configurado por `env` (dev aponta para o mailpit no docker; produção usa
SMTP da Resend com `secure: true`). Falha de envio → `createServiceUnavailableError` (503).
