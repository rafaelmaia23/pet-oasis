# pet-oasis — TODO

> O **índice** das fases: estado de cada uma, ponteiro para a fase aberta, resumo destilado
> das fechadas. O caderno de trabalho — spec e issues — vive em `.scratch/<slug>/`.
> Detalhes de decisões em `docs/context.md`. Regras de negócio firmadas no `CLAUDE.md`.
>
> **Forma de registro:** fase aberta fica em poucas linhas, com o ponteiro para a pasta do
> esforço; fase fechada é **destilada** em bullets de resultado. O molde das duas formas e as
> regras da transição estão em [`guides/todo-phases.md`](guides/todo-phases.md); o mapa da
> documentação inteira, em [`README.md`](README.md).

## Legenda
✅ feito · 🔄 em andamento · ⬜ a fazer · 🔸 polimento (não bloqueia)

---

# Ciclo 1 — Fundação (Fases 1–8) ✅

> Autenticação, autorização, usuários e perfis, e segurança (rate limit, lockout,
> observabilidade, ciclo de vida de deleção/reativação). **Fechado.** Todas as fases abaixo
> estão na forma resumida; o racional completo vive nos arquivos temáticos de `docs/context/` (indexados em `docs/context.md`) e nos ADRs.

## Fase 2 — Autorização e perfis ✅
> RBAC + CRUD de user com modelo de perfis. Regras e racional em `docs/context/authorization.md` e `docs/context/api-contracts.md`.
- Autorização: `computeEffectiveFeatures` (pura) + `can`/`hasFeature`/`canActOnResource`; middleware `authenticate`; autorização-antes-da-busca (403 vence 404).
- CRUD de user: POST / GET lista / GET :id / PATCH / DELETE; `createCustomer`/`createEmployee` (nested write); soft delete (`softDeleteUserAndInvalidateSessions`).
- Módulos read-only: role (`GET /roles`, `/roles/:id`) e feature (`GET /features`, `/features/:id`).
- Overrides de feature: `PUT`/`DELETE /users/:userId/features/:featureId`; não-escalação (`assertAdminForPermissionFeature`).
- Perfis: `POST`/`DELETE /users/:userId/customer|employee` (transação; recusa deleção do último perfil ativo; 204).
- Vínculo user↔role: `GET`/`POST`/`DELETE /users/:userId/roles/:roleId`; não-escalação generalizada (`assertAdminForRoleAssignment`).
- Permissions efetivas + me: `GET /users/:userId/permissions` (`string[]`); `GET /me` (view `me`).
- Soft delete de UserRole/UserFeature (id próprio como PK, unicidade do ativo por código).

---

## Fase 3 — Auth alvo (access JWT + refresh opaco rotativo) ✅
> Migrou de "JWT-como-Session validado no banco a cada request" para "access JWT 15min validado local + refresh opaco rotativo". Design e racional em `docs/context/identity-and-sessions.md` e `docs/context/schema.md`.
- `Session` reshaped: `refreshTokenHash`/`usedAt`/`userAgent`/`ipAddress` (sem `token`). `src/lib/token.ts` (gera/hash opaco).
- `authenticate` reescrito (valida JWT só localmente, sem hit no banco), movido de global → por-grupo-de-rota; erros via `create*Error` (idem `canAccess`).
- Endpoints: `POST /auth/login` (sempre cria Session nova), `POST /auth/refresh` (rotação + detecção de roubo por reuso → invalida todas as sessões), `POST /auth/logout` (por refresh cookie + ownership), `GET /auth/sessions` (só vivas), `DELETE /auth/sessions/:id` (404 unificado "não existe/morta").
- Features `read:session`/`manage:session` (substituem `logout:session`).
- Distinção de critério `invalidateAllUserSessions` (resposta a roubo, mantém `usedAt`) vs `softDeleteUserAndInvalidateSessions` (encerra conta, filtra `usedAt`).

---

## Fase 4 — Email, status de conta e banimento ✅
> Status de conta com verificação de email obrigatória, serviço de email genérico (nodemailer; mailpit em dev / Resend em prod), recuperação/troca de senha e banimento. Regras e racional em `docs/context/identity-and-sessions.md`.
- Modelo de status: `enum UserStatus { PENDING, ACTIVE }` + `bannedAt`/`bannedBy`/`banReason` ortogonais (idioma `deletedAt`); loga só com `status == ACTIVE && bannedAt == null`; desbanir limpa as três colunas e preserva o `status`.
- `VerificationToken` genérico (`purpose: EMAIL_VERIFICATION | PASSWORD_RESET`, hash salvo, TTL por purpose) + `src/lib/email.ts` (`send`, erro → 503).
- Verificação: todo user novo nasce `PENDING` (signup e `POST /users`); `POST /auth/verify-email` (204) + `/verify-email/resend` (sempre 200 genérico); orquestração em `verification.service.ts` (evita ciclo `auth`↔`user`); token ruim → 400 genérico.
- Recuperação/troca de senha: `POST /auth/forgot-password` (200 genérico) + `/reset-password` (204, token single-use, invalida TODAS as sessões) + `/change-password` logado (403 se senha atual errada, também invalida todas as sessões).
- Banimento: `POST`/`DELETE /users/:id/ban` `{ reason }` (`manage:user:status`); `assertAdminForBan` (features efetivas do alvo, não da role); auto-ban/-unban → 409; conta banida = "congelada" (login/forgot/resend/reset/change bloqueados, sessões derrubadas), **204** em ambos.
- Fechos: 2 bugs pré-existentes corrigidos — `getUserById` passou a autorizar antes de buscar (403 vence 404) e JSON malformado do body-parser virou **400** (era 500). Adotado o fluxo de branches por fase (`main` → `fase-<n>` → `feat/...`). Nasceu o `docs/reference/endpoints.md`.
- Suíte (329) + `typecheck` + `lint` verdes ao fechar.

---

## Fase 5 — Documentação da API + Containerização (deploy) ✅
> Fecha o Ciclo 1 como peça de portfólio: OpenAPI gerado dos schemas Zod → UI Scalar → coleção Bruno, usuário demo read-only, e deploy via Docker do zero. Racional em `docs/context/infrastructure.md`.
- OpenAPI 3.1 via `zod-openapi` + `.meta()` nativo do Zod 4 (sem monkey-patch) — schemas/presenters viram componentes nomeados; **`GET /openapi.json`** (público, router de topo, `servers: [{url:"/api/v1"}]`); doc verificada sem `passwordHash`/`tokenHash`/`refreshTokenHash`.
- UI Scalar interativa em **`GET /reference`** (público), consumindo `/openapi.json`, Bearer preenchível no "try it".
- Usuário demo read-only: role `demo` (`appliesTo EMPLOYEE`, só features de leitura) sempre semeada; usuário demo só nasce com `SEED_DEMO_USER=true` (ligado em Docker/prod, desligado em test/dev).
- `README.md` (novo) e coleção **Bruno** versionada em `api-collection/` (por módulo, environments `local`/`prod`); login encadeia o token via `bru.setVar` (não `setEnvVar` — não grava segredo no `.bru` versionado).
- Containerização: `Dockerfile` multi-stage não-root (client Prisma embutido no bundle via tsup, `src/generated` não copiado ao runtime); serviço `app` no compose sob profile `full`, derivando a própria `DATABASE_URL` (`@db`); entrypoint `migrate deploy → seed → start` (seed bundlado, `dist/seed.js`). Deploy documentado no `README.md`.
- Suíte (335) + `typecheck` + `lint` verdes ao fechar; nasceu o `docs/reference/endpoints.md` § "Docs".

---

## Fase 6 — Ambientes, Docker por ambiente e deploy ✅
> Reformula dev/test/prod para Compose base + overrides por ambiente, corrige dois bugs de deploy (SMTP hardcodado pro mailpit em vez da Resend; prod subindo db/mailpit de dev) e adiciona graceful shutdown. Nenhuma regra de negócio nova. Racional em `docs/context/infrastructure.md` e ADR `docs/adr/environments-and-deploy.md`.
- Envs por arquivo: `.env.{development,test,production}` (fora do git) + `.env.example`; `dotenv-cli` na autoria de migration; `vitest.config.ts` carrega `.env.test` (`npx vitest run <arquivo>` funciona sozinho).
- `src/lib/shutdown.ts` (`createShutdownHandler`, injeção de dependência): `server.close()` → `prisma.$disconnect()` → exit, timeout de força-saída; `server.ts` registra SIGTERM/SIGINT.
- Compose **base + overrides** (`.dev`/`.prod`/`.test`), isolados por `-p pet-oasis-{dev,test,prod}`: prod só `app` + Postgres-de-prod (mata os dois bugs); dev com bind-mount + client Prisma em volume anônimo; stage `dev` do Dockerfile roda como root (evita EACCES no bind-mount).
- Scripts por ambiente: `dev`/`dev:down`/`dev:reset`/`dev:mail`, `prod:up`/`prod:down`/`prod:logs`, `test` (teardown garantido por trap de EXIT) — substituem os antigos `services:*`/`stack:*`.
- Teste-guarda `clearDatabase.guard.test.ts` (Feature/Role/RoleFeature sobrevivem ao `clearDatabase` de propósito — não era bug).
- `typecheck` + `lint` + suíte verdes; verificação ponta a ponta dos 3 ambientes ao fechar.

---

## Fase 7 — Hardening e observabilidade ✅
> Ampliou o escopo original do roadmap ("rate limiting, account lockout") para observabilidade completa e polimento das features de conta já construídas. 9 sessões de trabalho (A–I), sub-fases 7.0–7.19, cada uma em feat-branch própria. Racional em `docs/context/security.md` e `docs/context/observability.md`, em `docs/reference/logging-policy.md` e nos ADRs `rate-limiting-and-lockout.md` / `pagination.md`.
- Infra e bordas (7.0–7.2): serviço `redis` nos três overrides do Compose (dev 6379 · test 6380 · prod sem porta publicada) e client `ioredis` que **falha rápido** — é isso que torna o fail-open real, não a decisão sozinha; `app.set("trust proxy", 1)`; `express.json({ limit })` com corpo grande virando **413** (era 500); helmet com CSP mais estrita que o default, bundle do Scalar **auto-hospedado** (`GET /scalar/standalone.js`) + nonce por request; CORS por allowlist; os 3 guards de escalação consolidados em `assertActorIsAdmin` (`lib/authorization.ts`).
- Observabilidade (7.3–7.6): `pino` com streams por ambiente (test escreve **só** no ring buffer — suíte silenciosa e ainda assim assertável), `redact` da política, `AsyncLocalStorage` com `requestId` ecoado no header e no corpo de erro; access log (`pino-http`, rotas de ruído em `debug`), application log por `logger.child({ module })`, error handler com ponto único de saída; `AuditLog` com taxonomia fechada como union em tempo de compilação, `record(descriptor, tx?)`, gravação transacional feita pelo **repository** (o service passa o descritor) e `metadata` só com ids/enums.
- Contrato de leitura (7.7–7.8): helper `src/lib/pagination.ts` com as duas estratégias (offset e cursor, com tiebreaker obrigatório por `id`), envelope `{ data, meta }` em **todas** as listagens (exceto `GET /users/:userId/permissions`), filtros estritos em `GET /users` (fora da allowlist → 422); `GET /audit-logs` (cursor + filtros, `ip` mascarado para quem não tem `read:audit-log:full`, só `GET`) e `GET /logs/recent` (ring buffer, limitação declarada no `meta`).
- Abuso e resiliência (7.9–7.12): rate limit por IP e por **email destinatário**; account lockout por conta (janela fixa → backoff exponencial, estado só no Redis, transição pura `applyFailure`, checado no ramo de senha correta) + `DELETE /users/:id/lock`; **fail-open** nos dois quando o Redis cai; Axiom (worker thread, `flush` no shutdown) e Sentry (só falha ≥500, `beforeSend` reusando a lista de campos proibidos do pino) opcionais por env var; timeouts em HTTP server, Prisma, Redis e SMTP.
- Higiene (7.13–7.14): teto de sessões vivas (`MAX_LIVE_SESSIONS`, evict da mais antiga — login nunca é recusado); scripts `cleanup-sessions`, `cleanup-audit-log` e `demo-reset` com `--dry-run`, transação e resultado no log, agendados por systemd timer em `infra/cron/`; `demo-reset` é truncate+reseed guardado por `DEMO_MODE=true`.
- Polimento de conta (7.15–7.17, desenho confirmado com o usuário em 2026-08-03): troca de email em 2 passos (`POST /auth/change-email` + `/auth/confirm-email-change`, aviso de segurança para o email **antigo**, alvo gravado no próprio token); `POST /users/:id/force-password-reset` (bloqueia o login inteiro até o reset, volta pelo mesmo fluxo do `forgot-password`); `GET /auth/sessions` com `device` parseado do user-agent e `current`.
- Fechos (7.18–7.19): "refresh token hasheado em repouso" já valia desde a Fase 3 (D1) — virou teste de regressão, não código novo; documentação da fase sincronizada. Suíte (606) + `typecheck` + `lint` verdes ao fechar.

---

## Seed de dados fake (usuários) ✅
> Trabalho pontual entre as Fases 7 e 8 — não é fase numerada; branch `feat/seed-fake-data-users` direto da `main`. Racional em `docs/context/infrastructure.md`.
- Duas flags independentes: **`SEED_FAKE_DATA`** (20 usuários — customers, employees, híbridos, e os cenários banido / pendente de verificação / soft-deletado, com senha compartilhada) e **`SEED_ADMIN_USER`** (acesso total, **nunca ligada em produção/demo** — decisão firmada com o usuário).
- Roster declarativo em `src/lib/seed/fakeUsers.constants.ts`, com email fixo como chave de idempotência **ignorando `deletedAt`** (o entrypoint roda o seed a cada boot, sem truncate antes); criação via `userRepository` e serviços reais de perfil/ban — nunca via `user.service`, que dispararia email de verificação a cada restart.
- `@faker-js/faker` e `cpf-cnpj-validator` migraram para `dependencies` (viraram código de produção, bundlado). Achado corrigido junto: `demo-reset.ts` não truncava `previousEmail`.
- Testes de integração em `tests/integration/lib/seed/` + verificação manual com o bundle real (`dist/seed.js`/`dist/demo-reset.js`). Suíte (618) + `typecheck` + `lint` verdes.

---

## Fase 8 — Autorização com escopo, cascata de deleção e reativação ✅
> **Única fase implementada, revertida e refeita.** O desenho original construiu a reativação de conta em cima de dois bugs pré-existentes (deleção que não cascateava; override de feature sem escopo) e boa parte da complexidade existia só para contorná-los; o código foi revertido para `d1b8478` em 2026-08-07 e a fase refeita com o escopo ampliado — consertar o modelo antes de construir sobre ele. 7 sessões (A–G), sub-fases 8.0–8.9, mais três "Passo 0" pontuais em branch própria. Racional em `docs/context/authorization.md`, `docs/context/lifecycle.md` e `docs/context/schema.md`, e no ADR `docs/adr/authorization-scope-and-lifecycle.md`; o documento de trabalho `docs/fase-8-redesign.md` foi dissolvido na 8.9.
- Modelo de autorização (8.0): `UserFeature.userId` → **`userRoleId`** (o override pendura na atribuição de role) + `@@unique([userRoleId, featureId])`; `UserRole` ganhou `grantedAt` e `@@unique([userId, roleId])`, com **reuso de linha** na re-concessão (201 em qualquer caso; 409 só para role já ativa); contrato `PUT|DELETE /users/:userId/roles/:roleId/features/:featureId` (422 nomeando `roleId` quando falta a role ativa; 404 seco no `DELETE`, que não revela se o usuário tem a role); `computeEffectiveFeatures` virou dois laços (todas as estáticas antes de qualquer override); a migration **zerou o banco** (só havia o demo de portfólio no ar). Fechou junto um buraco pré-existente: o guard de escalação não via override do wildcard `*`.
- Passos 0 (trabalho pontual, cada um em branch própria antes da sub-fase que dependia dele): `Role.appliesTo` virou **NOT NULL** (três branches mortos apagados, suíte inteira passou sem alteração); revogação do D6/D16 — a restauração deixou de ressuscitar override, e toda a máquina de política de restauração foi apagada; `restoreProfile` deixou de exigir instante exato — perfil **nomeado** volta mesmo tendo morrido antes da conta.
- Cascata de deleção (8.1): desce quatro níveis (`User` → perfis → `UserRole` → `UserFeature`) com **um único `new Date()` por transação**, concentrada em `src/modules/user/user.lifecycle.repository.ts`; só toca linha ativa (o que já estava morto mantém o timestamp antigo, e é isso que preserva a distinção na restauração); audit ganhou `USER_PROFILE_DELETED` e contagens de cascata na metadata, passadas como thunk porque só existem dentro da transação.
- Restauração (8.2): sobe dois níveis, com uma regra recursiva só — restaura o filho cujo `deletedAt` é **igual** ao do pai, lendo o `deletedAt` do pai **antes** de zerá-lo. Perfil volta por ser **nomeado**; roles do perfil, por correlação de data; override nunca volta por efeito colateral (só por `PUT` explícito na tripla, que revive a linha).
- Perfil em conta ativa (8.3): a **mesma rota cria ou reativa** (201 nos dois ramos, quem ramifica é o service); o catálogo passou a nomear o recurso — `create:customer-profile`/`reactivate:customer-profile` (self, em `SELF_MANAGEMENT_FEATURES`, porque a role `customer` morre junto com o perfil), variantes `:others` no grupo novo `CUSTOMER_SERVICE_FEATURES`, e o par de funcionário em `USER_ADMINISTRATION_FEATURES`; `create:*` e `reactivate:*` ficam separadas de propósito (poderes diferentes, concedíveis em separado). `canAccess` ganhou a forma OR e a autorização virou duas etapas (união das features antes da busca — 403 vence 404 —, específica do ramo depois). Furo pré-existente fechado: `POST /users` aceitava `roleNames` sem rodar a não-escalação.
- Conta deletada (8.4/8.5): volta pelo **signup** (email de conta morta + cpf batendo → **202**; cpf que não bate, conta banida ou conta ativa → o mesmo 409 genérico) ou por **`POST /users/:id/reactivate`** (feature nova `reactivate:user`, admin escolhe perfis e roles, 204). Nenhum dos dois reativa sozinho: ambos só emitem token, e quem conclui é o dono em `POST /auth/confirm-account-reactivation` (público, senha nova obrigatória, `phone` exigido só quando o perfil de cliente nasce do zero). Self-service nunca traz funcionário; `roleNames` significa "com que roles a conta volta" (restaura ou concede); a não-escalação roda por role que vai voltar, **antes de qualquer escrita**.
- Transversais (8.6–8.8): `PreviousEmail` parou de bloquear qualquer cadastro e perdeu o `@unique` global (continua como histórico); o rate limit cobriu as superfícies novas (mesmo balde por email-alvo do `forgot-password`) e as três rotas públicas de token (`tokenIpLimiter`), com o `Retry-After` migrando para `AppError.headers` — o que permitiu consumir limite de dentro de um service; conta com a role `demo` ficou isenta do account lockout (bug de produção pós-deploy da Fase 7 — senha pública transforma lockout por conta em DoS).
- Fechos (8.9): auditoria de doc antes da correção — sete afirmações envelhecidas durante a fase, a pior delas o `docs/reference/endpoints.md` descrevendo o **inverso** do D6'; o racional da fase foi consolidado (morava espalhado na seção de schema) e nasceu o ADR `authorization-scope-and-lifecycle.md`; varredura **por script** provando que as 43 rotas batem em `endpoints.md`, OpenAPI e coleção Bruno. Suíte (**719**) + `typecheck` + `lint` verdes.

---

# Ciclo 2 — Domínio pet shop (Fases 9–11)

> Abre o domínio do pet shop em si. A numeração das fases **continua global** (9, 10, …): o
> ciclo é agrupamento de leitura, não reinício de contagem — a convenção de branch do
> `CLAUDE.md` (`fase-<n>`, `feat/fase-<n>-<NN>-<slug>`) depende de um número único por fase.
> A Fase 9 (fechada) trouxe pets e catálogo, ainda **sem checkout**. A Fase 10 desbloqueia o
> front web e paga a dívida de deploy; a Fase 11 traz carrinho, pedido e pagamento.

## Fase 9 — Domínio pet shop: pets e catálogo ✅
> Abriu o Ciclo 2 com duas agregações quase independentes — pets (ligados a `Customer`) e catálogo (marca, categoria, tag, produto, variante) —, que só se tocam na faceta "para qual espécie este produto serve". **Sem checkout**: carrinho, pedido e pagamento são a Fase 11. 12 sessões (9.1–9.12), cada uma 1:1 com sua sub-fase e em feat-branch própria; as três últimas de kickoff em grelha (17, 19 e 13 decisões fechadas antes de qualquer linha). Racional em `docs/context/pet-domain.md` (índice) e nos ADRs `pet-domain-modeling.md`, `product-catalog-modeling.md`, `product-vs-service.md`, `text-search.md`, `file-storage-and-uploads.md` e no adendo de `pagination.md`; o que ficou de fora, com o motivo, em `docs/reference/backlog.md`.
- **RBAC do domínio e a decisão que moldou a fase (9.1):** 9 features novas pelo critério "existe cargo real que tem esta e não a vizinha", nenhuma privilegiada (custo/margem fica fora de `PRIVILEGED_FEATURES` — o guard existe contra escalação do próprio RBAC, e quem delega visibilidade de custo é o gerente), e duas roles de funcionário (`stockist`, `catalog-manager`, com `manager` provado superconjunto por teste). Junto veio a decisão estruturante: **a vitrine do catálogo responde sem token**, porque e-commerce vive de quem chega pelo Google sem conta — o que exigiu, na 9.6, um terceiro modo de autenticação (`optionalAuthenticate`, que segue anônimo até com token ruim, sem nunca responder 401).
- **Ordenação configurável (9.2), dívida do backlog paga antes de gerar retrabalho:** `?sort=&order=` só no offset (no cursor a chave teria que codificar o campo), allowlist como **mapa** campo → direção natural, `?order=` sem `?sort=` é 422, e tiebreaker por `id` também no offset — que fechou um furo pré-existente em `GET /users`.
- **Pets (9.3–9.5):** `PetSpecies` é enum fechado **sem `OUTRO`** (buraco permanente de qualidade de dado; espécie nova é migration barata), `Breed` é catálogo curado de 142 raças semeado uma vez e **nunca consultado em runtime**, e `SPECIES_WITH_BREED` é constante explícita (só cão e gato) em vez de derivada de "existe raça para esta espécie". `microchipId` é unique **global**, valendo para a linha excluída. `deceasedAt` ≠ `deletedAt`: o pet falecido continua na lista do dono. O escopo é decidido em duas etapas (rota admite dono e staff, service separa) e o alvo inexistente **falha fechado** em 403, senão a rota vira oráculo de existência. `Pet` virou o primeiro filho de **domínio** da cascata da Fase 8 — desce na deleção, volta por correlação de data.
- **Taxonomia (9.6):** árvore de **3 níveis** validada por funções puras sobre uma leitura só; produto vincula a qualquer nó, folha ou não; exclusão de categoria com filha ou produto ativo é **409**, sem cascata (sumiria com uma subárvore) e sem reparenting (mudaria o significado do que sobrou); slug derivado do nome e **congelado** no rename; `name`/`slug` unique global; `Tag` é o único **hard delete** de taxonomia, porque rótulo transversal não participa de venda. Nenhuma das três leituras pagina.
- **Produto e variante (9.7):** `Product` é identidade comercial e `ProductVariant` a unidade vendável — **nunca produto plano**, e o mínimo de uma variante é garantido na mesma transação da criação. `sku` unique global; estoque não fica negativo; exatamente uma default, mantida nas três escritas; `categories`/`tags` por substituição total com mínimo de uma categoria. A feature é exigida **por campo presente** no `PATCH` da variante (`stockQuantity` é `manage:stock`, o resto é `manage:product`) — é o que deixa o repositor contar prateleira sem editar o catálogo, e o ajuste de estoque virou ação própria no audit.
- **A vitrine (9.8):** três views **em escada** (`public` → `internal` → `cost`), escolhidas pela capability do ator e não pela rota — a primeira vez no projeto em que a *forma* da resposta muda com quem pergunta. `?status=` é ignorado em silêncio para quem não vê o interno, e produto invisível pedido pelo slug exato responde **404**, não 403 (403 confirmaria o slug do rascunho). Id-ou-slug na mesma rota, com a ambiguidade fechada na **escrita**. `?sort=price` é o menor preço entre as variantes ativas, e custou um segundo caminho no repository em vez de SQL cru.
- **Busca textual (9.9), o maior risco técnico da fase:** Postgres nativo (`tsvector` + `unaccent` + `pg_trgm`) por escolha explícita do usuário contra a recomendação inicial de `ILIKE`, com motivação didática. A decisão estruturante foi tratar erro de digitação **reescrevendo a query** contra um dicionário de lexemas — não por fallback no vazio nem por pontuação combinada, que falham justamente no caso "uma palavra certa e uma errada". O SQL cru **só ranqueia**: a visibilidade continua saindo do `buildProductWhere`, e é isso que impede rascunho e linha excluída de vazarem pela busca.
- **Upload (9.10):** três donos pela mesma tubulação, adaptador de storage com o banco guardando a **chave** e nunca a URL, dois derivados WebP por imagem com dimensões por dono, formato conferido pelos **bytes**. A promessa do ADR ("servido pelo reverse proxy, sem passar por Node") caiu por verificação: o proxy existe no servidor, não neste repositório — quem serve é `express.static`, com bind mount para que a troca futura seja config e não código. A linha de imagem é o **único hard delete de domínio** do projeto (imagem é asset, não fato de negócio), e o rate limit por **usuário** foi o primeiro do projeto com chave que não é IP nem email.
- **Seed fake e `demo-reset` (9.11):** 9 marcas, 20 categorias em 3 níveis, 8 tags, 35 produtos (51 variantes) e 15 pets em 12 donos, sob `SEED_FAKE_DATA`. O dataset é **cobertura de cenário, não volume**: cada rascunho, descontinuado e esgotado existe porque torna um filtro ou uma view demonstrável. Os bytes das imagens viraram base64 num `.ts` depois que a verificação derrubou o plano herdado — o estágio `runtime` do Dockerfile não copia `src/`, e o seed de produção não acharia arquivo nenhum. O `demo-reset` passou a limpar o upload **por prefixo de dono**, nunca a raiz.
- **Fechos (9.12):** a revisão da fase inteira rodou **antes** da documentação e achou cinco defeitos — o pior deles `?inStock=` apagando a faixa de preço em silêncio, que o `endpoints.md` descrevia como cumulativa; documentar primeiro teria sido documentar mentira. Junto, consertou-se uma regra de processo: um ADR citava um documento de `docs/planning/` escrito para ser descartável, o que separou rascunho de spec, virou verificação no `docs:check` e produziu `docs/README.md` e `docs/guides/todo-phases.md` — geografia depois revertida na Fase 10, regra mantida. O rastreio decisão → destino, feito antes de encolher esta seção, achou cinco decisões sem dono permanente e escreveu os donos — inclusive a seção de Fase 9 que faltava em `docs/context/schema.md`. Suíte (**1193**) + `typecheck` + `lint` + `docs:check` verdes.

---

## 🔄 Fase 10 — Desbloqueio do front web e dívida de deploy

> Tudo que o `pet-oasis-web` precisa da API para sair do lugar, mais a dívida de deploy que já
> derrubou a produção uma vez. Nenhum domínio novo. Spec e issues em
> `.scratch/fase-10-frontline/`.
- Progresso: 12 de 19 issues fechadas (as revisões da 07 e da 15 acrescentaram as issues 15 a 19).
- Pendente de verificação no servidor: a 04 (uploads fora do working tree) espera o teste de
  ponta a ponta com a stack de produção real — o resto dela está feito e verificado localmente.
- A 15 (a ponta viva da corrente na janela de graça) foi decidida e fechada; a 16 (`uploads/`
  sem dono num clone novo) também — o container de dev passou a escrever como o uid do host.
  A 17 (a rede `pet-oasis` morria no `prod:down`) virou `external:` como a `proxy`; **no servidor,
  `docker network create pet-oasis` antes do próximo `prod:up`**. Seguem abertas: a 18 (decisão em
  aberto — os dois caminhos em que a cascata ainda dispara sem roubo) e a 19, defeito no que a 04
  já mergeou.

---

## ⬜ Fase 11 — Carrinho, pedido e pagamento

Ainda **não planejada**. O caminho está em [`docs/README.md`](README.md): a ideia crua nasce em
`.scratch/`, é grelhada, vira spec e issues na pasta do esforço, e só então desce para cá como
resultado. O que já se sabe, decidido na Fase 9 e herdado por esta: `OrderItem` é
**polimórfico** com CHECK constraint escrito à mão (ADR `docs/adr/product-vs-service.md`), e o
item do pedido **grava** o preço em vez de lê-lo do produto. Do backlog, `StockMovement` é
desta fase por definição — é onde a movimentação de estoque passa a ter causa.
