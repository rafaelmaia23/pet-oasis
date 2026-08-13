# Rate limiting, account lockout e a dependência do Redis

> Decisão de segurança/infra registrada no planejamento da Fase 7 (sub-fases 7.0,
> 7.9, 7.10, 7.12). Introduz um serviço novo em produção e um comportamento novo
> no `login`. Não altera nenhuma regra de negócio já fechada.

## O problema

Hoje `POST /auth/login` aceita tentativas ilimitadas. As consequências são três,
e nenhuma é mitigada pelas defesas que já existem (bcrypt + pepper encarecem o
ataque offline, não o online):

1. **Força bruta direcionada.** Uma conta específica pode ser martelada até a
   senha cair, de um IP só ou de muitos.
2. **Volume.** `signup`, `forgot-password` e `verify-email/resend` disparam email
   a cada chamada — um script leva a cota da Resend embora e derruba a reputação
   do domínio remetente.
3. **Bombardeio de caixa alheia.** Um atacante que rotaciona IP pode pedir
   `forgot-password` mil vezes para a *mesma vítima*: cada request vem de um IP
   novo (limite por IP não vê nada), mas a caixa de entrada do alvo recebe tudo.

## Decisão ✅

### Dois mecanismos, não um

**Rate limit por IP** protege contra *volume*: não se importa com qual conta está
sendo tentada. **Lockout por conta** protege uma *credencial específica*, mesmo
que as tentativas venham de IPs diferentes (credential stuffing distribuído).
Um não substitui o outro — o primeiro é cego a ataque distribuído, o segundo é
cego a scraping de rotas sem conta alvo.

**Rate limit por email destinatário** é a terceira chave, e existe só para o
problema 3: `forgot-password` e `verify-email/resend` contam também por
email-alvo, no mesmo Redis, em namespace de chave separado.

### Redis, não memória de processo

`rate-limiter-flexible` com `RateLimiterRedis`. Um contador em memória
(`express-rate-limit` puro) resolveria o caso atual — instância única — e
quebraria **silenciosamente** no primeiro dia de scale-out horizontal: com duas
réplicas, cada uma permitiria o limite inteiro, e nada no sistema acusaria.
Também zera a cada restart de container, que num deploy frequente é o suficiente
para anular o lockout. Custo aceito: um serviço a mais nos overrides do Compose
e uma dependência a mais em produção.

### Fail-open quando o Redis cai

Redis indisponível → rate limit e lockout são **ignorados**, o request segue, e
cada falha emite `error` no application log (e portanto no Sentry).

O risco é real e está sendo aceito conscientemente: durante a indisponibilidade a
API fica sem proteção contra força bruta, e um atacante capaz de derrubar o Redis
ganha exatamente isso. A alternativa (fail-closed, 503 nas rotas de auth) troca
esse risco por outro pior no contexto deste projeto: o Redis passaria a ser
ponto único de falha do **login inteiro** — um `docker compose restart redis`
derrubaria a autenticação da aplicação. Disponibilidade do fluxo principal vence,
e a mitigação é operacional: a falha é barulhenta (`error` + Sentry), não
silenciosa.

### Lockout híbrido: janela fixa → backoff exponencial

`LOCKOUT_THRESHOLD` falhas consecutivas travam a conta por `LOCKOUT_WINDOW_MS`;
se a próxima tentativa depois da janela também errar, o tempo dobra a cada ciclo
até `LOCKOUT_MAX_MS`. Login correto reseta **contador e nível de backoff**.

Janela fixa sozinha é previsível: um atacante que espera exatamente o tempo da
janela nunca é penalizado além dela. O backoff crescente fecha essa lacuna sem
punir o usuário legítimo que errou a senha uma vez — só entra em jogo depois de
ciclos repetidos de erro.

A checagem entra em `auth.service.login`, ao lado dos gates de `bannedAt`/`status`
já existentes (Fase 4).

### Resposta 429 genérica

Rate limit por IP e lockout por conta devolvem **o mesmo 429** ("muitas
tentativas, tente novamente mais tarde"), sem indicar qual dos dois disparou nem
confirmar existência de conta. Senha errada continua **401** genérico (nenhuma
identidade estabelecida). Mesmo espírito anti-enumeração já adotado em
`forgot-password`/`verify-email/resend` na Fase 4.

### Desbloqueio manual pelo admin

`DELETE /users/:id/lock` (feature `manage:user:status`, a mesma do ban/unban):
limpa contador **e** nível de backoff — mesmo idioma do unban, que restaura o
estado anterior sem deixar resíduo. **204** no sucesso, **409** se a conta não
estava travada. Registra `AUTH_LOCKOUT_CLEARED` no audit log.

Destravar um alvo **privilegiado** exige ator com role `admin`, reusando o helper
consolidado na 7.2 (`src/lib/authorization.ts`). Destravar não concede privilégio
novo, mas *remove uma proteção* da conta-alvo: um manager comprometido poderia
destravar uma conta admin no meio de um ataque de força bruta, anulando o lockout
bem na hora em que ele mais protege — a mesma escalação lateral que
`assertAdminForBan` já barra.

**Não existe lock manual** nesta fase (o lock só acontece automaticamente por
tentativas erradas). Está no `docs/reference/backlog.md`: exigiria decidir como um lock
administrativo convive com `bannedAt` e `status`, reabrindo desenho já fechado.

## Valores

Todos por env var, com default. Escolhidos no planejamento sem tráfego real para
calibrar — a expectativa é ajustá-los, e é por isso que nenhum é constante no
código.

| Item | Default | Env var |
|---|---|---|
| Login, por IP | 20 / 15 min | `RATE_LIMIT_LOGIN` |
| Signup, por IP | 5 / 1 h | `RATE_LIMIT_SIGNUP` |
| Forgot-password e resend, por IP | 5 / 1 h | `RATE_LIMIT_EMAIL` |
| Forgot-password e resend, por email destinatário | 5 / 1 h | `RATE_LIMIT_EMAIL_TARGET` |
| Lockout — falhas até travar | 5 | `LOCKOUT_THRESHOLD` |
| Lockout — janela inicial | 15 min | `LOCKOUT_WINDOW_MS` |
| Lockout — teto do backoff | 24 h | `LOCKOUT_MAX_MS` |

## Timeouts (7.12)

O Redis entra com `connectTimeout` e `commandTimeout`. Sem eles, o fail-open
acima é ilusório: um Redis que não responde (mas também não recusa a conexão)
penduraria o login pelo tempo do timeout de socket do SO, que é o pior dos dois
mundos — nem protege, nem responde.

## Observabilidade

- Limite excedido → `AUTH_RATE_LIMIT_EXCEEDED` no audit log + `warn` no
  application log.
- Lockout disparado → `AUTH_LOCKOUT_TRIGGERED`; limpo → `AUTH_LOCKOUT_CLEARED`.
- Falha do Redis → `error` no application log (é a evidência de que a janela de
  fail-open aconteceu).

Taxonomia e `metadata` de cada ação em `docs/reference/logging-policy.md` §4.3.

## Alternativas consideradas

- **Contador em memória** (`express-rate-limit`): quebra silenciosamente em
  scale-out e zera a cada deploy. Preterido.
- **Fail-closed** (503 nas rotas de auth quando o Redis cai): Redis vira SPOF do
  login. Preterido — ver acima.
- **Fail-open no IP + fail-closed na conta** (híbrido por mecanismo): degradaria
  cada mecanismo conforme o que protege, mas o login continua caindo junto com o
  Redis, e passa a haver dois comportamentos para explicar, testar e documentar.
  Preterido: paga a complexidade sem eliminar o SPOF.
- **Só lockout, sem rate limit** (ou vice-versa): cada um é cego ao ataque que o
  outro cobre. Preterido.

## Quando revisitar

- Se o projeto ganhar **mais de uma réplica**: confirmar que os contadores de fato
  compartilham estado (é o motivo de o Redis existir) e revisar o `trust proxy`,
  de que depende a correção do IP.
- Se o **fail-open** for exercitado de verdade em produção (linha `error` no log):
  reavaliar com dados se vale migrar para híbrido.
- Se a Resend começar a **rejeitar por volume** mesmo com os limites: o furo está
  no limite por email destinatário, não no por IP.
- Se um lock **manual** virar necessidade operacional: sair do backlog e decidir
  a convivência com `bannedAt`/`status`.

**O que a Fase 7 mostrou até aqui (7.19):** o fail-open só foi exercitado
artificialmente — derrubando o container do Redis em dev/teste (7.0) — nunca
por uma falha real em produção; segue sem dado de produção para reavaliar o
ponto acima. Single-instance segue valendo (nenhuma réplica nova), e nenhum
volume de envio chegou perto de pressionar o limite por email destinatário.
Os quatro gatilhos acima continuam de pé, sem novidade a registrar ainda.

## Adendo (Fase 8.7) — dois pontos de consumo novos e um balde novo

A Fase 8 abriu duas superfícies que também disparam email para um endereço **sem
que o ator prove posse da conta**: o ramo de reativação self-service dentro de
`POST /auth/signup` (8.4, quando email+cpf batem com uma conta soft-deletada) e
`POST /users/:id/reactivate` (8.5, o admin forçando o envio). É a mesma superfície
do item 3 do problema original ("bombardeio de caixa alheia"), então os dois
passaram a consumir o **mesmo** `RATE_LIMIT_EMAIL_TARGET_*` já usado por
`forgot-password`/`verify-email/resend` — não um limitador novo.

**Por que o mesmo balde, inclusive para a rota autenticada de admin (K27):** o
orçamento é do **email**, não do ator. Dois baldes somariam na caixa da mesma
vítima e furariam exatamente a proteção que o limite por email-alvo existe para
dar. A contrapartida — um admin legítimo pode levar 429 porque um terceiro gastou
o orçamento daquele endereço — é um bloqueio temporário numa ação rara, e a `rule`
(`signup-reactivation`/`account-reactivation`) distingue a origem no audit log.
No caminho do admin o consumo acontece **depois** de todos os guards: um pedido
recusado por 403/404/422 não gasta o orçamento do alvo.

**Diferença técnica dos dois casos originais:** `rateLimitByEmailTarget` é um
middleware Express que lê `req.body.email` antes do controller. Nenhum dos dois
pontos novos se encaixa nesse formato — o signup só deve consumir no *ramo* de
reativação (não em todo cadastro), e o endpoint de admin não recebe email nenhum
no request (só `:id`; o email só existe depois da busca do alvo, dentro do
service). Solução: `enforce()` (`src/lib/rateLimit.ts`) parou de precisar de
`res` — o 429 passou a carregar o `Retry-After` no próprio `AppError`
(campo `headers`), aplicado pelo error handler central, que já era o ponto único
de saída desde a 7.5. Isso abriu um `consumeEmailTargetLimit(limiter, email, rule)`
chamável direto do service, sem middleware.

**Balde novo por IP para as rotas de token (K26):** `/auth/reset-password`,
`/auth/confirm-email-change` e `/auth/confirm-account-reactivation` são públicas,
consomem credencial opaca e não tinham freio nenhum. Ganharam o `tokenIpLimiter`
(`RATE_LIMIT_TOKEN_*`, default 20 / 15 min — o par do login, porque consumir
token é clique de link e precisa absorver NAT). Balde **próprio**, não o
`emailIpLimiter`: enviar email e consumir token são superfícies diferentes, e
dividir faria um reset legítimo comer o orçamento do outro. A decisão cobriu as
três de uma vez porque proteger só a rota nova deixaria duas irmãs idênticas
desprotegidas, sem razão de negócio que as distinga.

## Adendo (Fase 8.8) — conta demo isenta do lockout

Bug descoberto em produção pós-deploy da Fase 7 (2026-08-04): o account
lockout conta falhas por `userId`, sem distinção de origem — ao contrário do
rate limit por IP, que mantém baldes separados por origem. A senha do
usuário demo é pública (`README.md`), então o lockout, ali, deixa de proteger
qualquer credencial e vira só um vetor de negação de serviço: qualquer
visitante que erre a senha do demo trava a conta para **todo mundo** por até
24h (o backoff dobra a cada ciclo), derrubando a porta de entrada do projeto
para recrutadores. O demo-reset diário (7.14) não resolve — o estado do
lockout vive no Redis, fora do alcance do truncate/reseed do Postgres.

**Decisão:** a conta demo fica isenta do lockout, mas continua sujeita ao
rate limit por IP (que já é por-origem e não sofre do mesmo problema).
Isenção identificada pela **role `demo`**, não por comparação de email
contra uma env var — generaliza para futuras contas de demonstração e não
custa query extra: `userRepository.findUserByEmail` (usado por `login()`) já
inclui `roles` no mesmo fetch, então o predicado (`isLockoutExempt`,
`src/lib/lockout.ts`) roda sobre dado já em memória.

**Critério simples, sem qualificação (K28):** basta *ter* a role `demo` —
nada de "só se for a única role" nem de cruzar com features privilegiadas. A
primeira alternativa quebra em silêncio se uma conta de demonstração futura
precisar de uma segunda role; a segunda traria `computeEffectiveFeatures`
para o caminho quente do login e misturaria lockout com não-escalação.
Efeito colateral aceito e registrado: conceder a role `demo` a uma conta real
isenta aquela conta do lockout — hoje inalcançável na prática, já que só o
usuário demo semeado tem a role (o seed de dados fake não a usa).

**Alternativa descartada:** fazer o demo-reset diário também limpar as
chaves `lockout:*` do Redis. Descartada porque a janela de indisponibilidade
entre um reset e o próximo continuaria em até 24h — o ataque ainda derrubaria
o demo por quase um dia inteiro antes do próximo reset, só adiando o
problema em vez de eliminá-lo.
