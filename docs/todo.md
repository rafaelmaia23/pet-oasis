# pet-oasis — TODO

> Estado e ordem das tarefas. Consulte antes de começar; atualize ao concluir.
> Detalhes de decisões em `docs/context.md`. Regras de negócio firmadas no `CLAUDE.md`.
>
> **Forma de registro:** fase fechada fica **resumida** (o que entregou, em bullets); fase em
> execução fica **expandida** (passo-a-passo, decisões de kickoff, pendências). Ao fechar uma
> fase, o expandido é destilado — o *porquê* migra para `docs/context.md`/ADRs e o detalhe de
> execução permanece no histórico do git.

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

# Ciclo 2 — Domínio pet shop (Fases 9–10)

> Abre o domínio do pet shop em si. A numeração das fases **continua global** (9, 10, …): o
> ciclo é agrupamento de leitura, não reinício de contagem — a convenção de branch do
> `CLAUDE.md` (`fase-<n>`, `feat/fase-<n>-<m>-<slug>`) depende de um número único por fase.
> A Fase 9 traz pets e catálogo, ainda **sem checkout**; a Fase 10 traz carrinho, pedido e
> pagamento.

## 🔄 Fase 9 — Domínio pet shop: pets e catálogo

> Planejada em 2026-08-06, sessão de brainstorming/decisão consumida de
> `docs/planning/fase-9-contexto.md` (mantido ou apagado ao final da fase — decisão do
> usuário). Duas agregações praticamente independentes — **Bloco A** (pets, ligados a
> `Customer`) e **Bloco B** (catálogo: marca/categoria/tag/produto/variante) — que só se
> tocam na faceta "para qual espécie este produto serve". Carrinho, pedido e pagamento
> ficam para a **Fase 10**. Racional completo em `docs/context/pet-domain.md`, ADRs novos em
> `docs/adr/` (`pet-domain-modeling.md`, `product-catalog-modeling.md`,
> `product-vs-service.md`, `text-search.md`, `file-storage-and-uploads.md`, e um adendo em
> `pagination.md`), itens deixados de fora no `docs/reference/backlog.md`.
>
> **Muitas decisões de negócio ainda não foram tomadas** — ver os bullets `🔸 Pendência`
> em cada sessão abaixo. Cada uma é regra de negócio: apresentar 2–4 caminhos, a
> consequência de cada um, uma recomendação, e esperar a decisão do usuário antes de
> codificar (regra do `CLAUDE.md`). Nenhuma delas se resolve sozinha.

### Decisões firmadas no planejamento da fase

| # | Decisão | Escolha |
|---|---|---|
| N1 | Recorte da fase | Bloco A (pets) + Bloco B (catálogo), **sem checkout** — opção B entre três avaliadas (só pets era magro demais; loja completa com carrinho/pedido tinha cadeia de dependência longa demais). Carrinho/pedido/pagamento ficam para a Fase 10. |
| N2 | Espécie do pet | Enum fechado no banco, **sem `OUTRO`**: `DOG, CAT, RABBIT, BIRD, RODENT, REPTILE, FISH`. `OUTRO` seria um buraco permanente de qualidade de dado; espécie nova = migration barata (`ALTER TYPE ... ADD VALUE`). |
| N3 | Raça | Tabela `Breed` semeada por constante curada **uma vez** a partir de API pública (TheDogAPI/TheCatAPI), **nunca consultada em runtime**; `@@unique([species, name])`. `SPECIES_WITH_BREED` é constante **explícita** ao lado do enum, não derivada de "existe `Breed` para esta espécie" (evita efeito retroativo). |
| N4 | Rotas de pet | Coleção aninhada em `/customers/:customerId/pets`, recurso plano em `/pets/:petId` — `petId` é UUID global, `customerId` no item seria redundante e poderia discordar do dono real. Sem `/me/pets` nesta fase (backlog). |
| N5 | Falecimento vs. exclusão | `deceasedAt` separado de `deletedAt` — pet falecido continua na lista do dono, histórico clínico futuro permanece válido; excluir destruiria informação clinicamente relevante. |
| N6 | Produto e variante | `Product` (identidade comercial) + `ProductVariant` (unidade vendável: SKU/preço/estoque) — **nunca produto plano**. Todo produto tem ≥1 variante (produto "sem variação" ganha variante única `isDefault: true`) — evita o caminho duplo "produto com preço próprio × produto com variantes". |
| N7 | Categoria vs. espécie | Categoria em árvore = **função** do produto (`Alimentação > Ração seca`); espécie = **faceta** própria (`Product.targetSpecies: PetSpecies[]`), fora da árvore. Evita duplicar toda categoria folha por espécie ("problema da cama": uma cama serve cães e gatos, não são duas categorias). |
| N8 | Características da variante | Colunas fixas (`weightGrams`, `volumeMl`, `sizeLabel`) — EAV e JSON descartados (tipagem estrita é valor central do projeto; atributo novo é migration, barata e explícita). |
| N9 | Preço | **Inteiro em centavos** (`priceCents`, `compareAtPriceCents`, `costCents`) — nunca `Decimal`/float. Moeda implícita BRL. Congelamento de preço no pedido é decisão da Fase 10, mas já fica registrado: o item do pedido grava o preço, nunca lê do produto. |
| N10 | Status do produto | Enum `DRAFT/ACTIVE/DISCONTINUED` **coexiste** com soft delete (`deletedAt`) — significados distintos ("isto está à venda?" vs. "isto existe?"); descontinuado preserva histórico de venda. |
| N11 | Produto × Serviço (decisão **herdada pela Fase 10**) | Tabelas separadas (`Product`/`Service`), `OrderItem` **polimórfico** com CHECK constraint escrito à mão (nem `kind` único — armadilha confortável de colunas nulas —, nem supertipo/class table inheritance — junção a mais no caminho mais quente). Nada muda no schema da Fase 9; só o formato futuro de `OrderItem` já é conhecido. |
| N12 | Busca textual | **Postgres nativo** (`tsvector` + `unaccent` + `pg_trgm`) — não `ILIKE`, não Meilisearch/Typesense agora. Escolha do usuário, explicitamente contra a recomendação inicial (`ILIKE`), com motivação **didática**: o objetivo é aprender busca com tolerância a erro de digitação. |
| N13 | Upload de imagem | Disco local atrás de um **adaptador de storage** (`put`/`delete`/`url`, implementação `LocalDiskStorage`); path no banco (nunca URL completa); servido como estático pelo reverse proxy, sem passar por Node. |
| N14 | RBAC do domínio (decidido na sessão 9.1) | Granularidade pelo critério "existe cargo real que tem esta feature e não a vizinha"; 9 features novas (4 de pet, 5 de catálogo), nenhuma privilegiada; duas roles novas de funcionário (`stockist`, `catalog-manager`). Detalhe no resumo da sessão 9.1 e em `docs/context/authorization.md`. |
| N15 | Vitrine pública (decidido na sessão 9.1, era a pendência da 9.6) | Leitura de catálogo (`/products`, `/categories`, `/brands`, `/tags`, `/breeds`) responde **sem token** — o e-commerce vive de quem chega pelo Google sem conta. Exige um middleware de **autenticação opcional** (9.6) e nenhuma feature de leitura para o cliente. Racional em `docs/context/api-contracts.md`. |
| N16 | Busca textual — as dezessete decisões do kickoff (decidido na sessão 9.9) | Corpus é produto + marca (tag fica de fora, já é filtro); typo tolerado por **reescrita da query contra um dicionário de lexemas**, não por fallback nem por pontuação combinada; o SQL cru **só ranqueia** e a visibilidade continua sendo `buildProductWhere`. Tabela Z1–Z17 no bloco da sessão 9.9, racional no adendo de `docs/adr/text-search.md`. |
| N17 | Upload de imagem — as dezenove decisões do kickoff (decidido na sessão 9.10) | Três donos (produto, pet, marca) pela mesma tubulação; **o byte é servido pelo próprio Node** (`express.static`) porque o reverse proxy do ADR não existe neste repositório — mora no servidor pessoal onde a demo é hospedada —, com o volume em **bind mount** para que a troca futura seja config e não código; dois derivados WebP com dimensões por dono; a linha de imagem é o **único hard delete de domínio do projeto** (imagem é asset, não fato de negócio); rate limit **por usuário**, o primeiro com chave que não é IP nem email. Tabela AA1–AA19 no bloco da sessão 9.10.

### Sessões de trabalho

Diferente da Fase 8, aqui cada sessão é 1:1 com sua sub-fase (9.1 a 9.12) — sem
agrupamento de várias sub-fases numa mesma feat-branch.

| Sessão | Tema | Por que nesta posição |
|---|---|---|
| **9.1** | RBAC do domínio — decisão + seed | Toda rota nova precisa de feature. Sessão de **decisão com o usuário**, praticamente sem código. Nenhuma outra sessão começa antes desta fechar. |
| **9.2** | Ordenação configurável no helper de paginação | Dívida do `docs/reference/backlog.md`. Habilita todas as listagens da fase — fazer antes evita retrabalho em cada uma. |
| **9.3** | Espécies, raças e seed de `Breed` | Pré-requisito do CRUD de pets. |
| **9.4** | Pets — CRUD, escopo próprio | Núcleo do Bloco A. |
| **9.5** | Pets — escopo staff, listagem geral, filtros | Depende de 9.2 e 9.4. |
| **9.6** | Taxonomia do catálogo — `Brand`, `Category` (árvore), `Tag` | Pré-requisito de `Product`. |
| **9.7** | `Product` + `ProductVariant` — escrita | Núcleo do Bloco B. |
| **9.8** | Catálogo — leitura, views por capability, filtros | Depende de 9.2, 9.6, 9.7. |
| **9.9** | Busca textual | Depende de 9.8 existir para ter o que buscar. Maior risco técnico da fase — isolada de propósito. |
| **9.10** ✅ | Adaptador de storage + upload de imagem | Independente do resto — mais infra, menos domínio. |
| **9.11** ✅ | Seed fake do domínio + `demo-reset` | Depende do schema inteiro estar firme. Resolve a entrada "Dummy data para a demo" do `docs/reference/backlog.md`. |
| **9.12** | Fechos | Docs, coleção Bruno, README, `context.md`, revisão do backlog. |

### ✅ [Sessão 9.1] Fase 9.1 — RBAC do domínio: decisão + seed
> Sessão de decisão com o usuário (2026-08-13). Racional em `docs/context/authorization.md` (§ "Catálogo de features" e § "Roles de funcionário") e, para a vitrine pública, em `docs/context/api-contracts.md` § "Superfície pública".
- **Critério de granularidade** (vale daqui para frente): uma feature separada existe quando dá para imaginar **um cargo real que tenha ela e não tenha a vizinha**. Recusado o CRUD completo por recurso (levaria o catálogo de 24 para ~55 features).
- **9 features novas**, nenhuma privilegiada: `read:pet`, `manage:pet`, `read:pet:others`, `manage:pet:others`, `manage:product` (produto+variante+imagem), `manage:catalog-structure` (marca+categoria+tag), `manage:stock`, `read:product:internal`, `read:product:cost`. Falecimento de pet é `manage:pet` comum; `GET /breeds` é pública e não tem feature.
- **Custo/margem fora de `PRIVILEGED_FEATURES`**: o guard existe contra escalação do próprio RBAC; quem delega visibilidade de custo é o gerente, não o admin.
- **Duas roles novas** (`appliesTo: EMPLOYEE`): `stockist` (self-management + `read:product:internal` + `manage:stock`) e `catalog-manager` (self-management + estoque + autoria + custo). Nenhuma toca usuário/permissão/ban. `manager` permanece superconjunto de `catalog-manager` (garantido por teste). Recusadas: `veterinarian`/`groomer` (serviço é Fase 10; role sem endpoint é role morta).
- **Distribuição:** `customer` = `read:pet`+`manage:pet` (e **nenhuma** feature de catálogo — a vitrine é pública); `attendant` = pet `:others` + `read:product:internal`; `manager` = tudo do `catalog-manager` + pet `:others`; `demo` = `read:pet:others` + `read:product:internal`, **sem** `read:product:cost` (mesmo desenho de `read:audit-log:full` — o mascaramento se demonstra dentro do payload).
- **Vitrine pública decidida junto** (era a pendência §9.2, ancorada na 9.6): `GET /products`, `/products/:idOrSlug`, `/categories`, `/brands`, `/tags`, `/breeds` respondem sem token. Consequências anotadas nas sessões que as executam (9.6/9.8).
- ✅ Grupos novos em `role.constants.ts` (`PET_FEATURES`, `PET_SERVICE_FEATURES`, `STOCK_FEATURES`, `CATALOG_MANAGEMENT_FEATURES`); 35 features e 7 roles sincronizadas no seed.
- ✅ Testes: `tests/unit/modules/role/role.constants.test.ts` (feature órfã, composição de cada role nova, `demo` read-only e sem custo, `PRIVILEGED_FEATURES` intacto) e `tests/integration/lib/seed/roleCatalog.test.ts` (o declarado chegou ao banco). Suíte 734 + `typecheck` + `lint` verdes.

### ✅ [Sessão 9.2] Fase 9.2 — Ordenação configurável no helper de paginação
> Sessão de 2026-08-14. Quatro pontos de contrato que o adendo do ADR não especificava foram decididos com o usuário (S1–S4) e registrados no próprio adendo, em `docs/adr/pagination.md` § "O que a implementação (9.2) firmou além do adendo"; o resumo da decisão vive em `docs/context/api-contracts.md` § "Ordenação configurável só no offset".
- **`?sort=<campo>&order=asc|desc` só no offset.** No cursor a chave teria que codificar o campo de ordenação — a limitação continua registrada no `docs/reference/backlog.md` (a entrada da ordenação foi fechada; a do cursor, não).
- **A allowlist é um mapa, não uma lista:** cada recurso declara *campo → direção natural* (`defineSortConfig`), e é essa direção que responde `?sort=` sem `?order=` (data `desc`, texto `asc`) — assim `?sort=createdAt` não inverte a lista em relação a não mandar parâmetro nenhum (S2). Campo fora da allowlist → **422**; nome nenhum vindo do request chega ao `orderBy` do Prisma.
- **`?order=` sem `?sort=` → 422** nomeando `order` (S3): aplicar ao campo default amarraria o significado da URL a um default implícito, que mudaria em silêncio.
- **Tiebreaker por `id` agora também no offset**, seguindo a direção pedida (S4). Fechou um furo pré-existente: `GET /users` ordenava por `createdAt desc` **sem** desempate desde a Fase 2, então usuários com o mesmo timestamp já podiam repetir/sumir entre páginas.
- **Forma:** `buildOffsetQuerySchema(config, filtros)` devolve a query inteira com a regra do S3 embutida (mora no helper, não em cada recurso, para ser impossível esquecer); `buildOrderBy(query, config)` entrega o `orderBy` pronto ao repository. O refinamento é aplicado no par `sort`/`order` **antes** dos `.extend()` — no Zod 4 os checks sobrevivem ao extend, e refinar no fim quebraria a inferência do callback.
- ✅ Primeiro consumidor: `GET /users` (`createdAt`, `name`, `email`), com os query params novos no OpenAPI (de graça, via `fromEnvelope`) e na coleção Bruno.
- ✅ Testes: 10 unitários em `tests/unit/lib/pagination.test.ts` (allowlist, direção natural, `order` explícito vencendo, `order` sem `sort`, tiebreaker seguindo o `order`, `.shape` preservado para o OpenAPI) + 6 de integração em `GET /users` (asc/desc, default `createdAt desc` intacto, 422 de `sort` e de `order`, caminhada paginada com 5 nomes idênticos sem repetir nem omitir). Suíte **750** + `typecheck` + `lint` verdes.

### ✅ [Sessão 9.3] Fase 9.3 — Espécies, raças e seed de `Breed`
> Sessão de 2026-08-17. Cinco pontos que o ADR não especificava foram decididos com o usuário e registrados em `docs/adr/pet-domain-modeling.md` § "O que a implementação (9.3) firmou além da decisão"; o resumo vive em `docs/context/pet-domain.md`.
- **`enum PetSpecies`** (7 valores, sem `OUTRO`) e **model `Breed`** (`@@unique([species, name])`, `@@map("breeds")`) no schema. Sem `deletedAt` nem `updatedAt`: é tabela de referência, como `Feature`/`Role` — `species` e `name` *são* a chave, não há campo mutável. A back-relation `Breed.pets` fica para a 9.4.
- **`SPECIES_WITH_BREED` = só `DOG` e `CAT`.** Ave e roedor ficaram de fora porque o que existe neles não é raça, é espécie/variedade (calopsita, periquito; hamster sírio × anão russo) — incluí-los misturaria dois conceitos e obrigaria o dono a escolher um valor que não é raça. As outras cinco espécies exigem `breedId` **ausente** (422 na 9.4).
- **142 raças curadas** (96 cão, 46 gato) em `src/modules/breed/breed.constants.ts` — e **não** em `src/lib/seed/` como o ADR dizia: `SPECIES_WITH_BREED` é lida em runtime pelo `pet.service` da 9.4, e service de domínio importando do diretório de seed é arquivo no lugar errado. É também o que o `CLAUDE.md` já manda e o que `DEFAULT_ROLES`/`DEFAULT_FEATURES` fazem. A frase do ADR foi **reescrita**, não anotada como errata.
- **Linha `SRD`** por espécie com raça, provada por invariante unitária.
- **Seed por `createMany({ skipDuplicates: true })`**, não `upsert` em laço (não há o que atualizar), dentro da mesma transação de features/roles e sem flag de env. **Sem delete reconciliador** de propósito: a partir da 9.4 `Pet.breedId` referencia estas linhas, e apagar uma raça com pet quebraria o `migrate deploy → seed → start` do boot do container.
- **`GET /breeds`** público (sem `authenticate`, sem feature — 9.1/N15), `?species=` **opcional**, sem paginação (`meta {}`, mesma classe de `/roles` e `/features`), espécie fora do enum → 422. Pública "seca": sem view por capability, não depende da autenticação opcional da 9.6.
- **`Breed` é dado de referência** também no teardown: `clearDatabase()` não o trunca e `demo-reset` também não, então os testes de pet da 9.4 acham as raças já semeadas sem setup próprio.
- ✅ Testes: 6 unitários de invariante da constante (par duplicado, raça de espécie que não exige, espécie que exige sem nenhuma raça, SRD, `SPECIES_WITH_BREED` dentro do enum, nomes limpos), 4 de integração do seed (declarado chegou ao banco, rerun cria 0, SRD, nenhuma raça órfã), 6 da rota (200 **sem token**, 200 com token, filtro, espécie válida sem raça → lista vazia, 422, ordem alfabética), mais o guard do `clearDatabase` e o assert de `security: []` no OpenAPI. Suíte **766** + `typecheck` + `lint` verdes.

### ✅ [Sessão 9.4] Fase 9.4 — Pets: CRUD, escopo próprio
> Sessão de 2026-08-17. Núcleo do Bloco A e primeiro recurso de **domínio** do projeto. As duas pendências de negócio (§9.3 e §9.9 do `fase-9-contexto.md`) foram decididas com o usuário e, com mais três pontos de contrato, registradas em `docs/adr/pet-domain-modeling.md` § "O que a implementação (9.4) firmou além da decisão" (U1–U5).
- **`enum PetSex`** e **model `Pet`** conforme o §2.3 do planejamento, com uma alteração: **`microchipId` é `@unique` global** (U1) — precedente de `User.email`/`cpf` e `Customer.phone`, valendo também para a linha soft-deletada. Num identificador do mundo real prender o número é o comportamento certo (é o sinal "este pet já foi cadastrado aqui"), e a duplicata sai como **409** pelo handler de P2002, sem código novo. Índice parcial e validação no service foram recusados.
- **Rotas:** coleção aninhada (`POST`/`GET /customers/:customerId/pets`) e recurso plano (`GET`/`PATCH`/`DELETE /pets/:petId`), mais **`POST`/`DELETE /pets/:petId/deceased`** (U3) — falecimento tem rota própria no idioma do ban, é idempotente, e `deceasedAt` fica fora do `PATCH`. `:customerId` é o id do **perfil**.
- **Autorização em duas etapas:** o `canAccess` da rota admite dono e staff (forma frouxa de `can`), o service separa. Como o dono não está na URL, o alvo inexistente **falha fechado** — 403 e não 404 para quem não tem `:others` (U5), senão a rota vira oráculo de existência.
- **`PATCH` aceita tudo menos `customerId`, `deceasedAt` e `photoPath`** (U4). `species` **é** editável, e a validação de raça corre sobre o **estado resultante**: trocar a espécie sem ajustar a raça no mesmo corpo é 422.
- **`Pet` entrou no grafo de ciclo de vida** (U2): cascateia na deleção (perfil de cliente e conta inteira, com o `new Date()` único da transação) e **volta por correlação de data**, como `UserRole` — a assimetria do D6' é sobre vazamento de privilégio, e devolver a ficha do bichano não concede autoridade. Pet excluído à mão antes não volta. Contagens novas no audit: `cascadedPets`/`restoredPets`. Racional em `docs/context/lifecycle.md` § "Pet é o primeiro filho de domínio do grafo (9.4)".
- **Dois achados anteriores à sessão, corrigidos junto:** (a) **`GET /me` não devolvia `customer.id`**, embora a recusa de `/me/pets` no backlog se apoiasse explicitamente nisso — a coleção aninhada era inalcançável pelo próprio dono; o id de perfil entrou nas views de `me` e na `owner` de `user`. (b) A taxonomia de alvo do audit existia **em duplicata** (union `AuditTargetType` + `z.enum` à mão no filtro de `GET /audit-logs`); esquecer a segunda não quebrava o build, só recusava em silêncio um `?targetType=` legítimo — as duas passaram a derivar de `AUDIT_TARGET_TYPES`.
- ✅ `src/utils/definedOnly.ts` nasceu para reconciliar o opcional do Zod (`campo?: T | undefined`) com o do Prisma (`campo?: T`) sob `exactOptionalPropertyTypes` — o idioma de spread condicional não escala para os onze campos opcionais do pet.
- ✅ Testes: 40 de integração em `pet.test.ts` (CRUD, os três 422 de raça/espécie, `own` × `:others`, 403-antes-de-404 nas duas pontas, 409 de microchip, falecimento idempotente e fora da exclusão, nome do pet ausente do audit), 6 de cascata/restauração (`user.profile.test.ts`, `user.test.ts`, `account-reactivation.test.ts`), 4 de `definedOnly`, 5 do filtro de `targetType`, mais `pet` no guard do `clearDatabase`. Suíte **822** + `typecheck` + `lint` verdes.
- 🔸 Fica para a **9.10**: `Pet.photoPath` nasceu sem endpoint que a preencha (anotado na seção da 9.10).

### ✅ [Sessão 9.5] Fase 9.5 — Pets: escopo staff, listagem geral, filtros
> Sessão de 2026-08-18. Três pontos de contrato foram decididos com o usuário e registrados em `docs/adr/pet-domain-modeling.md` § "O que a implementação (9.5) firmou além da decisão" (V1–V3); o resumo vive em `docs/context/pet-domain.md`. Nenhuma migration: a sessão só acrescentou uma rota ao módulo que a 9.4 já deixou pronto.
- **`GET /pets`** — listagem geral de balcão, paginada por offset e ordenável, reusando o módulo inteiro da 9.4 (`petInclude`, `petViews.default`) e o helper da 9.2 (`buildOffsetQuerySchema`/`buildOrderBy`/`offsetEnvelope`).
- **`read:pet:others` declarada direto na rota** — única do módulo que foge da forma base. Não há o que o service separe (listar pet de terceiro *é* a rota), então `getAllPets(query)` nem recebe ator, no desenho de `userService.getAllUsers`.
- **V1 — falecido entra por default**, com `?deceased=true|false` como recorte. Esconder falecido por default faria `meta.total` mentir sobre o tamanho da base; quem quer a lista operacional limpa manda `?deceased=false`.
- **V2 — filtros**: `species`, `sex`, `customerId`, `breedId`, `microchipId`, `neutered`, `deceased`. `customerId`/`breedId` são **filtro, não resolução de recurso** (uuid inexistente → lista vazia, nunca 404 — senão a rota vira oráculo de existência de perfil); `microchipId` é busca exata e devolve no máximo uma linha (o campo é unique global desde a 9.4).
- **V3 — ordenação**: `createdAt` (default, `desc`), `name`, `species`. `birthDate` recusado por ser anulável e conviver com `birthDateIsEstimated`. `species` ordena pela ordem de declaração do enum no Postgres, não alfabética — dito no `endpoints.md`.
- **Duas assimetrias deliberadas, agora visíveis no `endpoints.md`**: só `GET /pets` pagina (a coleção do dono segue com `meta {}`, classe de `GET /users/:userId/roles`), e só ela exige a forma `:others` na rota. Quem quer os pets de um cliente paginados usa `GET /pets?customerId=`.
- ✅ `microchipIdSchema` extraído em `pet.schema.ts` (o filtro reusa a mesma regra do campo, sem o `nullable`).
- ✅ Testes: 25 de integração no `pet.test.ts` (401/403, envelope offset, paginação e página vazia, `limit` acima do teto, soft delete fora da lista, os três casos de `?deceased=`, um por filtro + combinados, 422 de valor e de uuid, uuid inexistente → lista vazia, ordenação asc/default, 422 de `sort` e de `order`, caminhada paginada com 5 nomes idênticos). Suíte **847** + `typecheck` + `lint` verdes.

### ✅ [Sessão 9.6] Fase 9.6 — Taxonomia do catálogo: `Brand`, `Category` (árvore), `Tag`
> Sessão de 2026-08-18. Abre o **Bloco B** (catálogo). As duas pendências de negócio (§9.7 e §9.8 do `fase-9-contexto.md`) foram decididas com o usuário e, com mais três pontos de contrato, registradas em `docs/adr/product-catalog-modeling.md` § "O que a implementação (9.6) firmou além da decisão" (W1–W7); o resumo vive em `docs/context/pet-domain.md`.
- **`Brand`, `Category` e `Tag`** no schema, em migration única. `Category` ficou com `description` e `deletedAt` (o ADR mostrava sem — a frase foi **reescrita**, não anotada como errata); `Tag` nasceu sem `deletedAt` e sem `updatedAt`, no idioma do `Breed`.
- **W1 — árvore de no máximo 3 níveis**, validada no service por funções puras (`category.tree.ts`) sobre **uma** leitura de todas as categorias ativas, não uma query por nível. O caso difícil é o re-parenting: mede a **altura da subárvore**, porque o nó movido carrega filhos junto.
- **W2 — produto vincula a qualquer nó**, folha ou não. Consequência herdada pela 9.8 (anotada lá): "produtos de X" = X **mais** os descendentes.
- **W3 — 409 na exclusão** de categoria com filha ativa. Sem cascata (sumiria com uma subárvore sem ninguém perceber) e sem reparenting (mudaria o significado de categorias que ninguém tocou). A metade "com produto vinculado" fica para a 9.7, anotada lá.
- **W4 — slug derivado do nome e congelado**; o `slug` explícito é aceito no corpo (no `POST` também) e vence o derivado. Nasceu `src/utils/slugify.ts` (NFD + remoção de diacríticos combinantes: "Ração" → `racao`, não `ra-c-ao`).
- **W5 — `Tag` é hard delete**: rótulo transversal não participa de venda. Única tabela de domínio do projeto sem `deletedAt`, e o audit vira o único registro de que a tag existiu.
- **W6 — `name`/`slug` unique global** (índice ignora `deletedAt`), no precedente de `Pet.microchipId`: recriar linha excluída é 409 pelo handler de P2002, sem código novo. Combinado com o W4, duas categorias homônimas em ramos diferentes colidem — daí o `slug` explícito no `POST`.
- **W7 — nenhuma das três leituras pagina**: `GET /categories` devolve a **árvore aninhada** (presenter recursivo com o getter do Zod 4), `/brands` e `/tags` a lista completa; as três com `meta {}`.
- ✅ **`optionalAuthenticate`** (transversal, primeira sessão que precisou): `authenticate` já tolerava header ausente, mas token malformado/expirado ainda virava 401 — o que a vitrine não pode fazer. Os dois modos dividem uma resolução token→ator única; o que muda é o que se faz com a falha. Rota opcional lê `req.user` **direto**, nunca via `getAuthUser`. Registrado em `docs/context/architecture.md` § "Roteamento".
- ✅ **Rate limit por IP da vitrine** (`catalogIpLimiter`, rule `catalog-read`), balde único para as quatro leituras públicas — separar por rota daria N orçamentos a um scraper. Fechou o buraco de `GET /breeds`, descoberta desde a 9.3.
- ✅ Achado corrigido junto: `toMatchView` (`tests/setup/zod-matchers.ts`) percorria a view ansiosamente e **estourava a pilha** na view recursiva de categoria; passou a memoizar e devolver um `z.lazy` na reentrada.
- ✅ Testes: 20 de integração em `brand.test.ts`, 14 em `tag.test.ts`, 24 em `category.test.ts`, 11 unitários de `category.tree.ts`, 5 de `slugify`, 6 novos de `optionalAuthenticate`, mais 2 de contrato no OpenAPI e a extensão do guard do `clearDatabase` (as três tabelas são transacionais, e a categoria entra no fixture **com filha** — a self-FK é o que quebraria um teardown fora de ordem). Suíte **930** + `typecheck` + `lint` verdes.
- 🔸 Fica para a **9.10**: `Brand.logoPath` nasceu sem endpoint que a preencha (anotado na seção da 9.10).

### ✅ [Sessão 9.7] Fase 9.7 — `Product` + `ProductVariant`: escrita
> Sessão de 2026-08-19. Núcleo do Bloco B. As três pendências de negócio (§9.3, §9.4 e §9.8 do `fase-9-contexto.md`) foram decididas com o usuário e, com mais sete pontos de contrato, registradas em `docs/adr/product-catalog-modeling.md` § "O que a implementação (9.7) firmou além da decisão" (X1–X10); o resumo vive em `docs/context/pet-domain.md`.
- **`enum ProductStatus`, `Product`, `ProductVariant`, `ProductCategory` e `ProductTag`** em migration única. As junções são **aresta, não filho**: sem `deletedAt`, substituídas por `deleteMany`+`createMany`, e a exclusão do produto as deixa onde estão.
- **X1 — `sku` unique global**, valendo para a variante excluída (409 pelo P2002). Índice parcial recusado pela terceira vez: daria ao projeto duas gramáticas de unicidade.
- **X2 — estoque não fica negativo** (422). **X3 — `POST /products` exige `variants[]` com min 1**, tudo numa transação: o invariante nunca é observável violado.
- **X4 — feature por campo presente no `PATCH /variants/:variantId`**: `stockQuantity` é `manage:stock`, o resto é `manage:product`, corpo misto exige as duas. A rota admite as duas e o service separa, no idioma do `pet.service`; `STOCK_FIELDS` é lista explícita porque a Fase 10 acrescenta reserva.
- **X5 — exatamente uma variante default**, garantida nas três escritas (nasce na primeira, promover rebaixa a anterior, excluir promove a mais antiga). **X6 — excluir a última variante ativa é 409**, no idioma do W3.
- **X7 — `categories[]`/`tags[]` por substituição total**, categoria com mínimo de um; id inexistente ou excluído é 422 **nomeando os ids que sobraram**. **X8 — exclusão do produto cascateia nas variantes** com um `new Date()` único, no molde de `cascadedPets`.
- **X9 — `ProductImage` fica para a 9.10** (anotado lá): o precedente de nascer órfão era para coluna, não para tabela. **X10 — `description` obrigatória com teto próprio de 2000** e **`label` da variante informado pelo staff**.
- ✅ **W3 fechado por inteiro**: `DELETE /categories/:id` recusa 409 também com produto **ativo** vinculado — vínculo de produto excluído não segura nada. Era a metade que não tinha o que checar até `ProductCategory` existir.
- ✅ **`PRODUCT_STOCK_ADJUSTED` é ação própria** no audit (com `from`/`to`): outra feature, outro cargo e outra pergunta na auditoria; corpo misto grava as duas linhas.
- ✅ Nasceu `tests/factories/product.factory.ts` (parse pelo schema → repository sem audit, `withResolvedDefault` no meio porque a default é invariante de domínio), já consumido pelo teste da categoria e reservado para a 9.8/9.11.
- ✅ Testes: 33 de integração em `product.test.ts`, 20 em `product.variant.test.ts`, 2 novos em `category.test.ts` (409 com produto ativo, 204 com produto excluído), 5 unitários de `withResolvedDefault`, 1 de contrato no OpenAPI e a extensão do guard do `clearDatabase` (produto amarrado às três pontas da taxonomia). Suíte **989** + `typecheck` + `lint` verdes.

### ✅ [Sessão 9.8] Fase 9.8 — Catálogo: leitura, views por capability, filtros
> Sessão de 2026-08-20. Abre a **vitrine** — a primeira listagem do projeto que responde sem token e a primeira em que a *forma* da resposta, e não só o acesso, muda com a capability do ator. As três pendências (`?status=` anônimo, `:idOrSlug`, ordenação por preço) foram decididas com o usuário e, com mais sete pontos de contrato, registradas em `docs/adr/product-catalog-modeling.md` § "O que a implementação (9.8) firmou além da decisão" (Y1–Y10); o resumo vive em `docs/context/pet-domain.md`.
- **Três views em escada**, não uma matriz: `read:product:cost` **implica** a visão interna (Y9), então nasceu só a `public` — `internal` e `cost` ficaram exatamente como a 9.7 as deixou. O predicado do recorte (`canSeeInternal`) é escrito **uma vez** e usado no `where` **e** na escolha da view: se divergissem, a resposta mostraria um campo do conjunto que a lista diz não existir.
- **Y1 — `?status=` ignorado em silêncio** para quem não vê o interno, e **Y8 — 404, não 403**, para o produto invisível pedido pelo slug exato. As duas pela mesma razão: a mensagem de erro *é* a resposta, e num endpoint público sem gate ela confirmaria o rascunho. "403 vence 404" vale para rota autenticada.
- **Y2 — id-ou-slug numa rota só**, com a ambiguidade fechada na **escrita**: o `slugSchema` compartilhado passou a recusar slug com forma de UUID (o regex de slug casava com um uuid — o problema era real, não teórico), e isso vale para marca, categoria e tag de brinde.
- **Y3 — `?sort=price` é o menor preço entre as variantes ativas.** O Prisma só ordena relação por `_count`, então a listagem por preço virou um **segundo caminho** no repository: `groupBy` de variante para a página de ids já ordenada, `findMany` para hidratar, ordem reimposta em memória. Sem SQL cru (reservado à 9.9) e sem coluna denormalizada. O `total` sai do `count` de produtos porque todo produto ativo tem ≥1 variante ativa (X3+X6) — é o invariante da 9.7 que autoriza o atalho.
- **Y4/Y10 — `inStock` derivado** na variante e no produto, em **todas** as views, calculado uma vez no `flattenProduct`; as respostas de escrita da 9.7 ganharam o campo junto.
- **Y5 — `targetSpecies: []` casa com qualquer `?species=`** · **Y6 — `?tag=` repetível é interseção** (um `some` por tag, não um `in`) · **Y7 — default `createdAt` desc**, allowlist `price`/`name`/`createdAt`.
- ✅ Nasceu `subtreeIdsOf` em `category.tree.ts`, ao lado de `isInSubtreeOf`: é o W2 virando filtro (`?category=` traz o nó **mais** os descendentes). Slug inexistente devolve subárvore vazia, que o service traduz em lista vazia — filtro não resolve recurso (V2).
- ✅ `buildProductWhere` é o recorte compartilhado por listagem e detalhe, de propósito: é o que impede um produto de sumir da lista e continuar acessível pela URL. A busca da 9.9 entra por ele.
- ✅ O par `orderBy`/`priceOrder` do repository é **união de tipo**, não campo opcional ao lado: `price` não é coluna, e um `orderBy: [{ price }]` que chegasse ao Prisma explodiria em runtime.
- ✅ Testes: 35 de integração em `product.read.test.ts`, 5 unitários de `subtreeIdsOf`, 4 de `withAvailability`, 8 do presenter (`product.presenter.test.ts`, novo), 2 do slug-uuid (produto e marca) e 1 de contrato no OpenAPI reescrito (as duas leituras como `security: []`). Suíte **1048** + `typecheck` + `lint` verdes.
- ✅ O caso "custo sem visão interna" tem **par**: sem o teste de contraste (mesmo cargo, mesmo fixture, sem o grant) o teste de Y9 passaria mesmo que o `deny` não tivesse pego — seria verde vazio.

### ✅ [Sessão 9.9] Fase 9.9 — Busca textual
> Kickoff de 2026-08-31, em sessão de grelha: **dezessete decisões (Z1–Z17) fechadas antes de
> qualquer linha de código**. É a sub-fase de maior risco técnico da fase e o único ponto do projeto
> com SQL cru. O ADR `docs/adr/text-search.md` ganhou o adendo que fecha as armadilhas 1 e 6 que ele
> havia deixado explicitamente em aberto.
>
> A decisão estruturante é a **Z5**: o erro de digitação não é tratado por fallback nem por
> pontuação combinada, e sim **reescrevendo a query** — cada palavra que não existe no catálogo é
> trocada pela mais parecida **antes** de virar `tsquery`. É o que faz `racao golen` funcionar
> (uma palavra certa + uma errada), que era o buraco das duas alternativas do ADR original.

#### Decisões do kickoff (Z1–Z17)

| # | Decisão | Escolha |
|---|---|---|
| Z1 | Corpus da busca | `name` + `description` do produto (coluna `tsvector` **gerada**) e `name` da marca (segunda coluna gerada, em `brands`), unidos por join. **Tag fica de fora**: já é filtro de primeira classe (`?tag=`, interseção, Y6), e incluí-la exigiria denormalização mantida por trigger (tag é N:N, e coluna gerada não cruza linha). |
| Z2 | SKU | Curto-circuito **exato**, case-insensitive, sobre variantes ativas: casou, o produto vem primeiro; a busca textual segue normal para o resto. SKU **não** entra no `tsvector` — o tokenizador quebraria `GOLDEN-AD-15KG` em pedaços e viraria ruído no ranking de todo mundo. |
| Z3 | Default de ordenação | Ter `?q=` troca o default para `relevance`; sem `q`, segue `createdAt desc`. `relevance` **sem** `q` continua 422. O default dinâmico não cabe no `defineSortConfig` (lá o default é constante da config), então mora no service. |
| Z4 | Onde mora a visibilidade | O SQL cru **só ranqueia**: devolve `(id, rank)`. O Prisma aplica `buildProductWhere()` + `id IN (...)` e a ordem é reimposta em memória — o idioma que a Y3 já usa para preço. Recusada a query crua completa: ela reescreveria em SQL o recorte que já existe em TypeScript, e "o que é visível" passaria a ter **duas** definições que precisariam concordar para sempre (o vazamento que a Y8 fechou, reaberto por outra porta). |
| Z5 | Tolerância a erro de digitação | **Reescrita da query por dicionário de lexemas.** Ranking permanece `ts_rank` puro. Preteridos: *fallback no vazio* (não tolera typo em query de várias palavras) e *pontuação combinada* (`ts_rank` + `similarity` somados exigem calibrar dois pesos sem dado real, e misturam escalas incomparáveis). |
| Z6 | Contrato de entrada do `q` | `trim`; vazio depois do trim → **422** nomeando `q`; mínimo 2, máximo 100 caracteres; combina em **E** com todos os filtros existentes. O 422 no vazio diverge de propósito do "ignorar em silêncio" da Y1: lá havia um segredo a proteger, aqui não há. |
| Z7 | Escopo da sessão | Só `GET /products`. `/brands`, `/categories`, `/tags` e `/breeds` são listas curtas e ficam registradas no `docs/reference/backlog.md` — a pergunta foi feita e respondida de propósito. |
| Z8 | Imunidade a acento | Wrapper `f_unaccent(text)` marcado `IMMUTABLE`, usado dentro das duas colunas geradas (coluna gerada exige função imutável, e `unaccent()` é `STABLE`). **Mentira consciente**, segura porque o dicionário `unaccent` não muda em produção — e perigosa se alguém editar o `unaccent.rules`, porque as colunas geradas não seriam reconstruídas. |
| Z9 | `total` na busca | Capado no teto de **500** ids ranqueados, em silêncio, com a limitação documentada na OpenAPI. Recusado um campo `truncated` no `meta`: aquele envelope é compartilhado por **todas** as listagens do projeto e não muda por causa de um caso. |
| Z10 | `?q=` com `?sort=` | Compõem. Com `sort=price`, os ids da busca entram como filtro do `groupBy` da Y3 — a busca vira "quem", o preço vira "em que ordem". Com `name`/`createdAt`, compõem de graça no caminho normal do Prisma. Recusar seria surpreendente: "busque ração e ordene do mais barato" é o gesto mais natural de uma vitrine. |
| Z11 | Onde mora o SQL cru | Arquivo novo `product.search.repository.ts`, ao lado — no idioma de `user.lifecycle.repository.ts` e `category.tree.ts`. O único arquivo do projeto com SQL cru fica identificável **pelo nome**, o que torna a regra do `CLAUDE.md` auditável. |
| Z12 | Pesos do ranking | `setweight` **A** no nome do produto, **C** na descrição — bem afastados de propósito (`ts_rank` padrão dá 1.0 e 0.2), para que uma palavra no nome sempre ganhe da mesma palavra enterrada em 2000 caracteres. Entre os dois vetores: `rank = rank_produto + 0.4 × rank_marca` — **somar**, porque casar no nome *e* na marca é mais relevante que casar em um só. |
| Z13 | Regra da correção | Só palavras **ausentes** do dicionário (palavra que existe nunca é "corrigida" — senão `cama` viraria `cana`), com **≥3 caracteres**; limiar `0.4` (o default `0.3` do `pg_trgm` é frouxo, `0.5` já rejeita `golen`→`golden`); empate pela lexema mais frequente. Palavra incorrigível vai **como está** → a busca devolve vazio, nunca é descartada em silêncio. |
| Z14 | Manutenção do dicionário | View materializada + script de refresh em `src/scripts/`, chamado pelo `db:seed` e pelo `demo-reset`. Recusado o trigger: manteria o dicionário sempre fresco ao custo de fazer **toda** escrita de produto escrever numa segunda tabela. A defasagem é benigna e limitada — produto novo é achado na hora por busca exata, sem acento e por radical; o que espera o refresh é só a **correção de typo** nas palavras inéditas dele. |
| Z15 | A correção é visível | `meta.search: { q, applied }`, presente **só** quando veio `q`. Diferente da Z9 (que recusou campo novo no envelope): aquilo era mecânica de paginação em toda listagem, isto é conteúdo **desta** busca. Evita o pior desfecho possível — zero resultados por um typo que o cliente não enxerga — e torna a correção afirmável em teste sem espiar a forma da query. |
| Z16 | Testes | Piso do ADR + ordem exata num fixture de três produtos (mesma palavra no nome × só na descrição × só na marca) + `DRAFT` invisível na busca anônima + `q` composto com `?category=`, `?tag=` e os demais filtros + `q` com `sort=price`. O teto da Z9 **não** se testa: exigiria 501 produtos no fixture para provar uma constante. |
| Z17 | Origem do dicionário | Construído **só de conteúdo publicamente visível** (produtos `ACTIVE` não deletados e suas marcas). Sem isso, a Z15 abriria um vazamento sondável palavra a palavra: `?q=colerinha` devolveria `applied: "coleirinha"` e confirmaria, a um anônimo, uma palavra que só existe num rascunho. Custo aceito: quem tem `read:product:internal` também não ganha correção de typo em palavra inédita de rascunho. |

#### O que a implementação firmou

- ✅ **A correção é contra palavras, não contra lexemas.** O dicionário guarda a palavra escrita **e** o lexema dela; a presença é conferida pelos dois (a forma escrita ou o radical), e a substituição devolve uma **palavra**. Isso mata a armadilha de radicalizar duas vezes pela raiz — a query corrigida volta por `plainto_tsquery('portuguese', f_unaccent(...))`, simétrica com as colunas geradas — e é o que faz `meta.search.applied` ser legível (`racao golden`) em vez de um radical (`raca golden`).
- ✅ **`SET LOCAL` no lugar de `set_limit`.** O limiar entra por `SET LOCAL` dentro da transação da correção: `set_limit()` é sessão-scoped e sobreviveria ao retorno da conexão ao pool. É `$executeRawUnsafe` porque `SET` não aceita bind — o valor interpolado é constante do código, nunca entrada do usuário. Usar o operador `%` (e não `similarity() >= x`) é o que faz o índice GIN trigrama ser usado de fato.
- ✅ **O `total` da busca é exato dentro do teto**, não estimado: o recorte visível é resolvido em ids (barato), a ordem do ranking é reimposta sobre o que sobrou e `total` é o tamanho dessa interseção. Duas queries, sem `count` separado.
- ✅ **`?order=asc` numa busca inverte o ranking** em vez de ser ignorado — aceitar o parâmetro e não honrá-lo seria a opção (C) que a Z10 recusou.
- ✅ **O par de testes de rascunho pegou um erro de verdade.** O caso anônimo (lista vazia) passava; o caso do funcionário, não — e a falha era do teste, não do código. Sem o contraste, o verde do primeiro teria sido vazio, exatamente a lição da 9.8.
- ✅ **A revisão de código mudou a Z5 num ponto: a busca literal roda primeiro, e a correção só entra quando ela volta vazia.** Corrigir sempre era um bug real e provado — "whisky" (produto criado depois do último refresh) virava "whiskas" e o produto certo nunca aparecia. É o que sustenta a promessa de que produto novo é encontrado na hora; sem isso, a defasagem do dicionário deixava de ser benigna e passava a **esconder** produto. Tem teste de regressão próprio.
- ✅ Outras quatro correções vindas da revisão: `REFRESH` passou a ser `CONCURRENTLY` (sem isso ele pega ACCESS EXCLUSIVE e derruba toda busca em curso — o índice unique da migration existia justamente para isso e não estava sendo usado); a inversão de `?order=asc` passou a acontecer **antes** do curto-circuito de SKU (senão buscar por SKU com ordem invertida mandava o produto para a última página); o `clearDatabase` passou a esvaziar o dicionário (palavras vazavam de um arquivo de teste para o outro); e nasceu o script `npm run db:refresh-search`, no padrão dos `db:cleanup-*`.
- 🔸 **Sobrou uma aresta conhecida, consequência direta da Z4:** o teto de 500 é aplicado **antes** do recorte de visibilidade, então linha soft-deletada e rascunho consomem cota do teto. Só morde num catálogo com mais de 500 casamentos para o mesmo termo, e fechá-lo significaria repetir `deleted_at IS NULL` no SQL cru — o primeiro passo da duplicação que a Z4 recusou. Registrado no `docs/reference/backlog.md`.
- 🔸 A defasagem do dicionário continua existindo, agora sem morder: quem cria produto pela API não ganha **correção de typo** nas palavras novas até o próximo `npm run db:refresh-search`, mas a busca literal acha o produto na hora. Automatizar o refresh (timer em `infra/cron/`, no molde dos `cleanup-*`) é decisão para quando houver produção real.

#### O que a implementação firmou

- ✅ **A AA2 mudou por um fato do ambiente, não por preferência.** A verificação mostrou que não existe reverse proxy neste repositório (`infra/docker-compose.prod.yml` publica `app:3000` direto) — ele vive no servidor pessoal que hospeda a demo, fora do git. Quem serve `/uploads/*` passou a ser o próprio Node, com o volume em **bind mount**, e o adendo do ADR narra a troca futura como configuração (`alias` no nginx + `UPLOAD_PUBLIC_BASE_URL`).
- ✅ **`Retry-After` já existia** para todos os limiters (`src/lib/rateLimit.ts`), então a AA18 custou só `rateLimitByUser` e o `scope: "USER"` no `enforce`. `canAccess` roda **antes** do limiter na rota: quem não pode subir imagem recebe 401/403 sem consumir cota.
- ✅ **A migration precisou ser escrita à mão**, como a da 9.9: o `prisma migrate dev` gera, junto da tabela nova, um `DROP DEFAULT` nas colunas `search_vector` e o drop dos dois índices GIN — drift falso do `Unsupported`, que quebraria a busca inteira. O primeiro `migrate dev` chegou a falhar no banco de dev e foi revertido com `migrate resolve --rolled-back`.
- ✅ **As views de produto viraram duas famílias** (`productViews` e `productListViews`), com as mesmas três chaves de capability. Foi o preço de honrar a AA14 (`image` na lista, `images` no detalhe) sem duplicar a escada: o service produz **os dois** campos e a whitelist do Zod derruba o que a view não declara — um caminho de código só, e a view decide. As cinco asserções de `product.read.test.ts` sobre `response.body.data` passaram a apontar para a família de lista.
- ✅ **`Brand.logoPath` não estava tão órfã quanto o planejamento supunha:** ela já aparecia no `brand.presenter`. As duas colunas (`photoPath`, `logoPath`) foram **substituídas** nas views por `photo`/`logo` com as duas URLs — devolver a chave amarraria o cliente ao layout do disco, que é o que a AA2 quer manter livre. Como nunca houve escritor, nenhum cliente dependia do formato antigo.
- ✅ **`flattenProduct` passou a derivar a marca aninhada** pelo mesmo `withLogo` de `GET /brands`. Sem isso a marca teria uma forma dentro do produto e outra fora — a classe de divergência que a Y8/Z4 fecharam.
- ✅ **A carência da varredura virou env var** (`UPLOAD_ORPHAN_GRACE_HOURS`), seguindo o precedente de `SESSION_RETENTION_DAYS`/`AUDIT_LOG_RETENTION_DAYS` — é botão de operação, não regra de domínio. O teto de 8 imagens e as dimensões continuam constantes, como a AA19 mandava.
- ✅ **`clearDatabase` ganhou `productImage`** (FK RESTRICT, antes de `product`) — só a **linha**. O arquivo fica: `UPLOAD_DIR` é um diretório único por run em `os.tmpdir()`, apagado inteiro no teardown, e dar responsabilidade de filesystem ao `clearDatabase` seria repetir a armadilha do dicionário da 9.9 por outra porta.
- 🔸 **O `demo-reset` ainda não limpa o diretório de upload**, e isso é deliberado (AA/Q24): limpar sem repovoar deixaria a vitrine da demo sem foto para sempre. A limpeza e as imagens de exemplo são da **9.11**, anotadas lá.
- 🔸 A varredura nasceu **sem systemd timer**. Entra no dia em que ela encontrar algo duas vezes.

#### Passo-a-passo

- ✅ **Migration escrita à mão** (uma só): `CREATE EXTENSION unaccent, pg_trgm` · `f_unaccent` (Z8) · `products.search_vector` e `brands.search_vector` geradas com `setweight` (Z1, Z12) · dois índices GIN · a view materializada de lexemas, recortada pelo visível (Z17), com índice GIN `gin_trgm_ops`. As duas colunas entram no `schema.prisma` como `Unsupported("tsvector")` para o `migrate` não acusar drift. Vale para dev, test e prod pelo mesmo caminho — o `tests/setup/global.ts` já roda `migrate deploy`.
- ✅ **Script de refresh** do dicionário em `src/scripts/` (Z14), chamado pelo `db:seed`; helper `refreshSearchDictionary()` em `tests/helpers/` para os poucos testes de typo. Esquecer o helper faz o teste **falhar**, não passar em falso — é o lado seguro do erro.
- ✅ **`product.search.repository.ts`** (Z11): reescrita da query (Z13), ranqueamento (Z12), teto de 500 (Z9). `$queryRaw` com template parametrizado, nunca concatenação. O limiar do `pg_trgm` é definido **por query**, nunca por sessão (armadilha 6 do ADR — o pool de conexões torna a sessão inútil como escopo).
- ✅ **Service**: curto-circuito de SKU (Z2) → correção → ids ranqueados → `buildProductWhere` + `id IN` → ordem reimposta em memória (Z4); default dinâmico de `sort` (Z3); `meta.search` (Z15). `?q=` entra pelo `where` compartilhado, **nunca** pelo `orderBy`.
- ✅ **Schema**: `q` (Z6), `relevance` na allowlist `PRODUCT_SORT`, e o refinamento "`relevance` exige `q`" no molde do "`order` exige `sort`" que já vive em `buildOffsetQuerySchema`.
- ✅ **OpenAPI**: `?q=`, `sort=relevance`, o objeto `meta.search` e a nota de que o `total` da busca é limitado (Z9).
- ✅ **Testes** (Z16). A armadilha desta sessão é o teste frouxo: a asserção é **comportamento observável** ("buscar `golen` acha 'Ração Golden'", "o do nome vem antes do da descrição, que vem antes do da marca"), nunca a forma da query.
- ✅ **Não radicalizar duas vezes**: a palavra corrigida sai do dicionário **já radicalizada**, e passá-la de volta por `websearch_to_tsquery` a radicaliza outra vez. Costuma ser inócuo e não é garantido — precisa de teste provando que `golen` chega ao banco como `golden`.
- ✅ Entrada da Z7 no `docs/reference/backlog.md` (busca nas demais listagens do catálogo).

**Herdado da 9.8, e ainda válido:**
- ✅ `?q=` e `?sort=relevance` são **acréscimo** à listagem que já existe — a allowlist `PRODUCT_SORT` (`product.schema.ts`) nasceu com `price`, `name` e `createdAt`.
- ✅ A listagem já tem **dois** caminhos no repository (o normal e o `groupBy` de preço, Y3). A busca é o terceiro, e o `where` compartilhado (`buildProductWhere`) é o que impede os três de divergirem sobre visibilidade — todo filtro novo entra lá, nunca no `orderBy`. É exatamente o que a Z4 preserva.

### ✅ [Sessão 9.10] Fase 9.10 — Adaptador de storage + upload de imagem
> Kickoff de 2026-09-02, em sessão de grelha: **dezenove decisões (AA1–AA19) fechadas antes de
> qualquer linha de código**, no molde da 9.9. É a sub-fase menos de domínio e mais de infra da
> fase — e a única em que um efeito colateral (o byte no disco) não participa da transação do
> Postgres, o que é a origem de metade das decisões abaixo.
>
> A decisão estruturante é a **AA2**: o ADR prometia "servido como estático pelo reverse proxy, sem
> passar por Node", e a verificação mostrou que **não existe reverse proxy neste repositório** — o
> compose de prod publica `app:3000` direto. O proxy existe no servidor pessoal onde a demo é
> hospedada, fora do git. Então quem serve o byte passa a ser `express.static`, com o volume em
> **bind mount** para que trocar por `alias` no nginx seja config, nunca código nem migration.

#### Decisões do kickoff (AA1–AA19)

| # | Decisão | Escolha |
|---|---|---|
| AA1 | Escopo de donos | Os **três**: `ProductImage` (tabela nova, N imagens), `Pet.photoPath` e `Brand.logoPath` (colunas órfãs desde a 9.4/9.6). O caro da sessão é o encanamento (adaptador, magic bytes, `sharp`, órfãos, rate limit); pet e marca são a mesma tubulação com aridade 1. Adiá-las pagaria o encanamento de novo, num contexto sem memória desta sessão. |
| AA2 | Quem serve o byte | `express.static("/uploads")` na própria app, volume em **bind mount** (host → `/app/uploads`). Recusado (a) deixar sem servir — quebraria a demo da 9.11; (b) subir Caddy/nginx no compose agora — é fase de infra disfarçada de sub-fase de catálogo. O bind mount é o que mantém a opção do proxy a um bloco de `location` de distância: o banco guarda a **chave**, e quem serve é irrelevante para ele. Adendo no ADR narrando que a promessa está adiada, não abandonada. |
| AA3 | Como o multipart entra | `multer` com **`memoryStorage`**, **um arquivo por request**, campo `file`. É o único desenho em que "o nome do usuário nunca chega ao disco" é verdade por construção (e não por disciplina), e em que arquivo recusado não deixa temporário. `diskStorage` grava antes de saber se o arquivo presta; `busboy` cru seria código nosso para manter. |
| AA4 | Um request por imagem, não um com N | O front continua deixando o usuário selecionar 8 fotos num gesto só — ele dispara 8 requests. Ganha progresso **por imagem** e retry **por imagem** (a 4ª falhou, as outras 7 já estão salvas); o navegador paraleliza ~6. Um request com N arquivos forçaria ou tudo-ou-nada (o usuário perde as 7 boas) ou uma resposta de status misto que só este endpoint usaria — e seguraria 40 MB em RAM com `memoryStorage`. |
| AA5 | Derivados | **Dois** por imagem (`full` e `thumb`), sempre **WebP**, EXIF removido. Entrada aceita JPEG/PNG/WebP por **magic bytes**. Fora AVIF (encode caro no ARM64) e fora GIF (animação viraria quadro único em silêncio — pior que recusar). |
| AA6 | Dimensões por dono | Constante por dono, não número único: produto `1600`/`400`, pet `800`/`200`, marca `512`/`128`. Marca fica com os **dois** tamanhos (e não um só) porque logo também aparece pequena na lista e maior na página da marca — e um dono com conjunto diferente forçaria `url(path, size)` a ter um tipo por dono. |
| AA7 | Tetos e substituição | **5 MB** por arquivo (413 acima), **8** imagens por produto (422 na nona), **1** por pet e **1** por marca. `PUT` com foto existente **substitui** e apaga a anterior do disco — trocar a foto é um gesto, exigir `DELETE` antes seria atrito. Contrapartida aceita: `PUT` acidental destrói o arquivo anterior sem volta (não há soft delete de disco). |
| AA8 | Layout da chave | `<owner>/<ownerId>/<uuid>` — produto morto é um diretório a apagar, e a varredura de órfãos pergunta "existe dono com este id?" só pelo caminho. Recusados o plano (`<owner>/<uuid>`, que obriga consulta por arquivo) e o sharding por prefixo (irrelevante nesta escala). |
| AA9 | Como o banco registra os dois derivados | **Uma** coluna `path`, guardando a **chave base** (`products/<id>/<uuid>`); o adaptador resolve `url(path, "full" \| "thumb")` acrescentando sufixo e extensão. Tamanho novo vira entrada num union, nunca migration. Duas colunas permitiriam representar o estado impossível "tem full, não tem thumb". Consequência a documentar no schema: o valor no banco **não é caminho de arquivo**, é chave. |
| AA10 | Rotas | Coleção `POST /products/:productId/images`; item **aninhado** `DELETE /products/:productId/images/:imageId` e `PATCH /products/:productId/images/order`. Valor único por `PUT`/`DELETE` em `/pets/:petId/photo` e `/brands/:brandId/logo` (multipart, campo `file`), resposta `200` com a **view do dono** — não existe recurso "foto de pet" endereçável. `DELETE` em dono sem foto: **204**, idempotente. |
| AA11 | `productId` que discorda do dono real | **404.** `/products/A/images/X` com `X` de outro produto não existe mesmo, e a resposta não revela que `X` existe em outro lugar. Vale igual para id estranho dentro do array do `PATCH .../order`. Custo aceito: id certo com dono errado fica indistinguível de id inventado — bom para segurança, chato para depurar. |
| AA12 | Resposta do upload de produto | `201` com a **imagem criada** (`id`, `position`, `thumbUrl`, `fullUrl`). Devolver o produto inteiro (ou `204`) obrigaria o front a caçar a imagem nova no array para conseguir o `imageId` que ele precisa em seguida para o `DELETE` e para a reordenação. |
| AA13 | Contrato da reordenação | Corpo é o **array completo** de `imageId` na ordem desejada, e precisa ser exatamente o conjunto do produto (faltou/sobrou → 422). Idempotente, sem estado intermediário inválido. **Capa é a posição 0**, sem flag `isCover`: flag separada criaria duas respostas possíveis para "qual é a capa?". |
| AA14 | Views | Lista (`GET /products`) devolve **só a capa** (`image: { thumbUrl, fullUrl } \| null`); detalhe devolve o **array ordenado** com os dois URLs por item. Pública e de staff mostram **o mesmo** — metadado de arquivo (bytes, quem subiu) é diagnóstico, e diagnóstico neste projeto mora no audit log, não na view. `photoPath`/`logoPath`, hoje invisíveis em qualquer presenter, entram junto. |
| AA15 | RBAC | **Nenhuma feature nova.** Produto já estava resolvido na 9.1 (`manage:product` nasceu descrevendo "e imagens"); foto de pet exige `manage:pet` no próprio e `manage:pet:others` no de terceiros (mesma regra do `PATCH /pets/:petId`); logo de marca exige `manage:catalog-structure`. Critério da 9.1: não existe cargo que edita a ficha do pet mas não pode trocar a foto. |
| AA16 | Ciclo de vida da linha | **Hard delete** da linha junto com o arquivo — exceção consciente ao soft delete do projeto, porque imagem é *asset*, não fato de negócio. Soft delete da linha com arquivo apagado criaria a linha-apontando-para-o-nada que o ADR classificou como pior que órfão. **Soft delete do produto NÃO apaga arquivo**: produto restaurado voltaria sem imagem, silenciosamente, contra a assimetria deletar/restaurar firmada na Fase 8. Registrar em `docs/context/lifecycle.md`, senão daqui a seis meses parece descuido. |
| AA17 | Audit log | **7 ações novas**: `PRODUCT_IMAGE_UPLOADED`, `PRODUCT_IMAGE_DELETED`, `PRODUCT_IMAGES_REORDERED`, `PET_PHOTO_UPDATED`, `PET_PHOTO_DELETED`, `BRAND_LOGO_UPDATED`, `BRAND_LOGO_DELETED`. `targetType` é o **dono** (`Product`/`Pet`/`Brand`), com `imageId` no metadata — alvo novo no enum só se paga se alguém for filtrar por ele, e a pergunta de auditoria é "o que aconteceu com este produto?". |
| AA18 | Rate limit | **Por usuário** (`rl:upload:user:<userId>`), **150 / 15min** — primeiro limiter do projeto com chave que não é IP nem email. Por IP atropelaria o mutirão de cadastro inicial (cinco funcionários atrás do mesmo NAT dividindo cota justamente no dia em que todos estão lá). O que este limiter barra — script bugado e conta comprometida — é propriedade de *uma conta*. O limite estrutural mais forte continua sendo o teto de 8 por produto. `Retry-After` **já existe** para todos os limiters (`src/lib/rateLimit.ts`), nada a acrescentar. |
| AA19 | Env var × constante de código | **Env** (varia por ambiente ou é botão de operação): `UPLOAD_DIR`, `UPLOAD_PUBLIC_BASE_URL`, `UPLOAD_MAX_FILE_SIZE_BYTES`, `RATE_LIMIT_UPLOAD_MAX`/`_WINDOW_MS`. **Constante** (é regra de domínio): 8 imagens por produto, as dimensões da AA6, os formatos aceitos. Critério: "um produto tem no máximo 8 imagens" não muda entre dev e prod — regra que mora em env é regra que ninguém acha ao ler o domínio. |

#### Varredura de órfãos — as três decisões

- **Carência de 24h.** A ordem de escrita é disco → linha, então arquivo gravado há 200ms cuja linha *está sendo inserida agora* é indistinguível de órfão. Sem carência, a varredura apaga imagem de upload legítimo no meio do request: o usuário recebe `201`, a linha existe, o arquivo não. Bug fantasma, impossível de reproduzir.
- **Direção inversa só reporta.** Linha apontando para arquivo inexistente é sintoma de bug nosso ou de perda de disco; apagar a linha faz o sintoma sumir e leva a evidência junto. Registra em `error`, não toca.
- **Sem systemd timer por enquanto.** Os `cleanup-*` têm timer porque limpam crescimento esperado e contínuo (todo login cria sessão); órfão de upload só nasce de falha, e timer para evento que não deveria acontecer é ruído no `infra/cron/`. Fica `npm run db:cleanup-uploads` manual; o timer entra no dia em que a varredura achar algo duas vezes.

#### Passo-a-passo

Branch `feat/fase-9-10-uploads`, saindo de `fase-9`. Um commit por item, teste antes do código.

- ✅ **1 — Adaptador.** `sharp` + `multer` instalados; `src/lib/storage/` com a interface `Storage` (`put`/`delete`/`url`), `LocalDiskStorage` e o pipeline `sharp` parametrizado pelo dono (AA6). Validação por magic bytes (AA5), nome uuid gerado por nós. **Testes de unidade, sem HTTP**: arquivo disfarçado é recusado, nome do usuário nunca vira caminho, os dois derivados nascem.
- ✅ **2 — Rate limit.** `rateLimitByUser` ao lado do `rateLimitByIp` e `scope` do `enforce` (hoje `"IP" | "EMAIL"`) ganhando `"USER"`; env vars novas em `.env.example` (AA19). A ação de audit continua `AUTH_RATE_LIMIT_EXCEEDED` — o nome já não é literal desde o limiter de catálogo da 9.6, e renomear mexeria em histórico gravado.
- ✅ **3 — `ProductImage`.** Migration (tabela + relação `Product.images`), `POST /products/:productId/images` (AA3, AA12) e as views da AA14.
- ✅ **4 — Item e ordem.** `DELETE /products/:productId/images/:imageId` (AA11, AA16) e `PATCH /products/:productId/images/order` (AA13).
- ✅ **5 — Pet.** `PUT|DELETE /pets/:petId/photo`; `photoPath` finalmente entra no presenter do pet. O `PATCH /pets/:petId` continua recusando `photoPath` no corpo (422) — upload é o único caminho.
- ✅ **6 — Marca.** `PUT|DELETE /brands/:brandId/logo`, idem para `logoPath` e para a recusa no `PATCH /brands/:brandId`.
- ✅ **7 — Servir.** `express.static` de `/uploads`, `UPLOAD_PUBLIC_BASE_URL` e o bind mount nos três compose (AA2). Pode subir para depois do (3) se você quiser ver a imagem no navegador cedo — os testes provam a URL sem ninguém servir byte nenhum.
- ✅ **8 — Varredura.** `src/scripts/cleanup-uploads.ts` + `npm run db:cleanup-uploads`, no padrão dos `cleanup-*`.
- ✅ **9 — Docs.** OpenAPI (`multipart/form-data` com `format: binary`), Bruno (aba Multipart Form; **`api-collection/assets/sample.jpg` versionado**, senão a coleção quebra na máquina de quem clonar — e é ele que prova "entra JPEG, sai WebP"), adendo no `docs/adr/file-storage-and-uploads.md` (proxy adiado + a nota do ARM), `docs/context/lifecycle.md` (AA16) e `docs/reference/logging-policy.md` (as 7 ações da AA17).

#### Testes (AA + o piso do ADR)

- ✅ Magic bytes recusa arquivo disfarçado (`.jpg` que é HTML/SVG/ELF); nome do usuário nunca chega ao disco; teto de 5 MB → 413; nona imagem → 422.
- ✅ `UPLOAD_DIR` de teste é diretório único por run (`mkdtemp` em `os.tmpdir()`), criado no `tests/setup/global.ts` e apagado no teardown com `fs.rm(..., { recursive: true, force: true })` dentro de `finally` — suíte vermelha também limpa. Runs em paralelo não se contaminam, e o `clearDatabase` **não** ganha responsabilidade sobre filesystem (foi essa a armadilha do dicionário na 9.9). `LocalDiskStorage` real, `sharp` real: teste que não exercita o caminho de produção passa em falso.
- ✅ Imagem de outro produto no path → 404 (AA11); array incompleto na reordenação → 422; capa da lista é a posição 0 depois de reordenar.
- ✅ `PUT` de foto de pet substitui e o arquivo anterior **some do disco**; `DELETE` em pet sem foto → 204.
- ✅ Soft delete do produto **preserva** o arquivo (AA16); hard delete da linha de imagem apaga arquivo e linha.
- ✅ `demo` não sobe arquivo (403 explícito, sem feature de escrita); rate limit por usuário devolve 429 **com `Retry-After`**.
- ✅ Órfão (arquivo sem linha, mtime > 24h) é removido pela varredura; arquivo recém-gravado **não** é; linha sem arquivo é reportada e **não** apagada.

#### Riscos conhecidos

- 🔸 **`sharp` no ARM64 só funciona se a imagem for construída no próprio servidor ARM** — é o que o `prod:up` faz hoje (o compose tem `build:`). Construir num x86 e enviar a imagem pronta quebra em runtime com "could not load the sharp module", erro que não se parece nada com a causa. Vai como nota no `docs/context/infrastructure.md`.
- 🔸 O `JSON_BODY_LIMIT=100kb` **não** afeta multipart (`express.json` só age em `application/json`) — o teto do upload é o do `multer` (AA7). Vale um teste, porque é a primeira coisa que alguém vai suspeitar quando um upload de 3 MB falhar por outro motivo.

### ✅ [Sessão 9.11] Fase 9.11 — Seed fake do domínio + `demo-reset`
> Sessão de 2026-09-03, com kickoff em grelha (dezessete decisões AB1–AB17 fechadas antes de
> qualquer linha de código; o detalhe está no histórico do git). O *porquê* migrou para
> `docs/context/pet-domain.md` § "Dataset fake do domínio (9.11)" e para
> `docs/context/infrastructure.md` (§ "Dataset fake" e § "Seeds e ambiente demo").
- **A decisão estruturante nasceu de uma verificação que derrubou o plano herdado.** A 9.10 previa
  `.webp` versionados em `src/lib/seed/assets/`, e o estágio `runtime` do `Dockerfile` não copia
  `src/` — o tsup tampouco empacota `.webp`. O seed de produção, que roda a cada boot, não acharia
  arquivo nenhum. Os 51 assets viraram base64 em `fakeImages.constants.ts` (~2 MB), gerado por
  `tools/generate-fake-images.ts` a partir de `assets-inbox/` (fora do git, e do Biome).
- **O item do refresh de lexemas já estava feito** desde a 9.9: `runSeed()` termina com
  `refreshSearchLexemes()`. A sessão só conferiu a ordem — o catálogo fake é semeado antes.
- ✅ Dataset: 9 marcas, **20** categorias em 3 níveis, 8 tags, 35 produtos (51 variantes) e 15 pets
  em 12 donos, mais `employee06`/`employee07` para as roles `stockist` e `catalog-manager` da 9.1.
  Tudo sob a mesma `SEED_FAKE_DATA`, na ordem usuários → pets → catálogo → refresh.
- ✅ `demo-reset` trunca as oito tabelas novas do catálogo, limpa o upload **por prefixo de dono**
  (nunca a raiz — `deleteDirectory("")` atingiria o ponto de montagem do bind mount) e conta
  `uploadFiles` também no `--dry-run`. Ordem: truncate → limpar → reseed.
- ✅ `seedFaker.ts`: o `faker` do seed passa a ser semeado **por chave** (email, ou SKU nas
  variantes). O roster deixou de ser sequência e virou conjunto — apender não desloca mais nada.
- ✅ Testes: 52 novos (invariantes do roster sem banco, idempotência dos dois seeds, cenários da
  AB9/AB10, `countFiles`, e o `demo-reset` limpando e contando arquivo). Suíte **1185** +
  `typecheck` + `lint` verdes.
- ✅ Entrada "Dummy data para a demo" marcada como resolvida em `docs/reference/backlog.md`.

#### O que a implementação corrigiu do próprio kickoff

- **A árvore tem 20 categorias, não 16 (AB8).** 13 folhas mais 7 nós intermediários; o 16 foi
  contagem errada minha no planejamento, e cortar nós para caber no número teria mutilado a
  taxonomia — inclusive o 3º nível, que existe para exercitar o limite de profundidade do
  `category.service`.
- **A distribuição de status é 29 `ACTIVE`, não 28 (AB7).** `status` e `deletedAt` são
  **ortogonais** (ADR `product-catalog-modeling`), então o produto soft-deletado continua `ACTIVE`:
  são 29 com esse status, 28 de fato visíveis. O roster estava certo; a asserção do teste é que
  nasceu errada, e virou a documentação do próprio invariante.
- **`description` e `sku` ficaram à mão, contra a letra da AB2**, e pelo motivo que a AB11 criou ao
  escolher marcas reais: `faker.commerce` em inglês embaixo de "Ração Golden Fórmula Cães Adultos"
  seria absurdo, e `A1B2C3D4E5` não se parece com SKU. Preço, custo e estoque continuam sorteados.
- **A interface `Storage` ganhou um quinto método, `countFiles(prefix)`** — a AB6 tinha recusado um
  `exists(key)`, mas a AB14 exige o número no dry-run. São casos diferentes: `exists` seria por
  imagem a cada boot (uma chamada de rede por imagem num backend remoto), `countFiles` é três
  chamadas por reset diário. A alternativa era `fs.readdir` dentro do script, que é exatamente o
  que o adaptador existe para evitar.

### ⬜ [Sessão 9.12] Fase 9.12 — Fechos
- ⬜ `docs/reference/endpoints.md` — as rotas novas de catálogo, e a seção "Mounting" com a categoria nova de autenticação opcional (rotas públicas que enriquecem a resposta quando há token). **`breeds` (9.3) e `pets` (9.4) já entraram**, e as **sete rotas de imagem da 9.10** também (mais os dois parágrafos de Mounting: o estático `/uploads/*` e o balde de upload por usuário); conferir, não reescrever.
- ⬜ `README.md`/`docs/context/authorization.md` — conferir que as roles novas (`stockist`, `catalog-manager`) aparecem onde o projeto descreve os cargos.
- ⬜ Coleção Bruno — environments `local`/`prod`. `breeds/` já entrou na 9.3, `pets/` na 9.4 (com `Get Me` gravando `customerId`, que é o que encadeia a coleção aninhada), `brands/`, `categories/`, `tags/` na 9.6 e `products/`, `variants/` na 9.7 (encadeadas por `brandId`/`categoryId`/`tagId` → `productId` → `variantId`) — conferir, não reescrever; falta a **leitura** — `GET /products` (com os filtros e a ordenação da 9.8) e `GET /products/:idOrSlug`, que valem uma requisição **sem** `Authorization` na coleção, porque é a única forma de a demo mostrar a view pública ao lado da de staff; mais o `?q=` da 9.9.
- ⬜ `docs/context/pet-domain.md` promovido de "planejada" a "implementada"; parágrafo "Fase 9 (fechada)" em `docs/context/history.md`; decisões novas indexadas em `docs/context.md`.
- ⬜ `docs/reference/logging-policy.md` — conferir a taxonomia final. As quatro ações de pet e o `targetType` `Pet` entraram na 9.4, as nove de taxonomia na 9.6, e as sete de produto/variante (com `Product`/`ProductVariant` e o `PRODUCT_STOCK_ADJUSTED` separado) na 9.7, e as **sete de imagem na 9.10** (com o `targetType` do dono e o `PRODUCT_IMAGES_REORDERED` distinguindo reordenação pedida de compactação) — conferir, não reescrever.
- ⬜ `docs/reference/backlog.md` revisado — nenhum item resolvido pela fase sem marcação, nenhuma entrada nova esquecida.
- ⬜ `README.md` — roadmap promove a Fase 9 a ✅, contagem de testes atualizada.
- ⬜ Decisão do usuário: apagar `docs/planning/fase-9-contexto.md` ou mantê-lo em `docs/planning/` como registro histórico.
- ⬜ Apagar `docs/planning/fase-9.11-assets.md` — documento de trabalho da 9.11, criado só para
  o usuário juntar as imagens; o que sobra no repositório é o `fakeImages.constants.ts` gerado
  a partir dele (9.11/AB1).
- ⬜ Conferir que `assets-inbox/` não sobrou na árvore de trabalho e continua fora do git — os
  originais das imagens não são versionados, só o base64 derivado (9.11/AB12).
- ⬜ `npm run typecheck` + `npm run lint` + suíte completa verdes; Fase 9 marcada ✅.
