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
| **9.10** | Adaptador de storage + upload de imagem | Independente do resto — mais infra, menos domínio. |
| **9.11** | Seed fake do domínio + `demo-reset` | Depende do schema inteiro estar firme. Resolve a entrada "Dummy data para a demo" do `docs/reference/backlog.md`. |
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

### ⬜ [Sessão 9.7] Fase 9.7 — `Product` + `ProductVariant`: escrita
- ⬜ **Herdado da 9.6:** as join tables `ProductCategory` e `ProductTag` nascem **aqui**, não na 9.6 — elas referenciam `Product`, que não existia ainda. `ProductCategory` tem o mínimo de **uma** categoria por produto; `ProductTag` não tem mínimo. Produto vincula a **qualquer nó** da árvore, folha ou não (9.6/W2).
- ⬜ **Herdado da 9.6 (W3):** com `ProductCategory` existindo, `DELETE /categories/:id` passa a recusar **409** também quando houver produto vinculado — hoje ele só checa filha ativa. Desvincular está fora de questão: violaria o mínimo-de-uma-categoria. O ponto de enganche é `categoryService.deleteCategory`, que já tem a nota no código.
- ⬜ **Herdado da 9.6 (W4/W6):** o slug de `Product` segue a mesma regra — derivado do nome na criação, congelado depois, `slug` explícito aceito no corpo e vencendo o derivado; unique global. Reuse `resolveSlug`/`slugSchema` de `src/modules/catalog/catalog.schema.ts` em vez de reescrever a regra.
- ⬜ `enum ProductStatus { DRAFT ACTIVE DISCONTINUED }`; model `Product` (`targetSpecies: PetSpecies[]`, `brandId`, `status`, soft delete) + `ProductVariant` (`sku` @unique, `priceCents`, `compareAtPriceCents?`, `costCents?`, `stockQuantity`, `weightGrams?`, `volumeMl?`, `sizeLabel?`, `barcode?`, `isDefault`, soft delete).
- ⬜ `POST/PATCH/DELETE /products`, `POST /products/:id/variants`, `PATCH/DELETE /variants/:id` (recurso plano, mesmo racional dos pets) — todas sob `manage:product` (9.1).
- ⬜ Ajuste de `stockQuantity` é `manage:stock`, **não** `manage:product` (9.1): o repositor conta prateleira sem poder editar o catálogo. Se o `PATCH` de variante aceitar os dois tipos de campo no mesmo corpo, decidir aqui como as duas features se combinam (caminho natural: exigir a feature de cada campo presente).
- ⬜ Todo produto nasce com ≥1 variante — produto "sem variação" ganha variante única `isDefault: true`.
- 🔸 **Pendência** (ver §9.3 do `fase-9-contexto.md`): unicidade de `sku` — unique global vs. unique parcial vs. validação no service (mesmo dilema do `microchipId` da 9.4, já documentado para email/cpf no `docs/reference/backlog.md`).
- 🔸 **Pendência** (ver §9.4 do `fase-9-contexto.md`): estoque pode ficar negativo? Sem carrinho ainda, o único caminho de mudança é edição manual pelo staff — aceitar negativo (registra erro de contagem real) ou barrar em 422?
- 🔸 **Pendência** (ver §9.8 do `fase-9-contexto.md`): slug do produto gerado ou informado — mesma decisão da 9.6, reaplicada aqui.
- ⬜ Testes: produto sem variante é rejeitado; variante default automática quando só uma é criada; validação de `targetSpecies` (array vazio = qualquer espécie).

### ⬜ [Sessão 9.8] Fase 9.8 — Catálogo: leitura, views por capability, filtros
- ⬜ **Herdado da 9.6 (W2):** `?category=<slug>` precisa trazer os produtos vinculados àquela categoria **mais** os dos descendentes dela — produto pode estar em nó intermediário, então filtrar só pelo nó exato esconderia metade da vitrine. A árvore tem no máximo 3 níveis, então a expansão é rasa e cabe numa leitura da árvore inteira.
- ⬜ **Herdado da 9.6:** a **autenticação opcional** já existe (`optionalAuthenticate`, montado em `/brands`, `/categories`, `/tags`) — reuse, não reescreva; e a rota entra no balde `catalog-read` do `catalogIpLimiter`, não num limiter novo.
- ⬜ `GET /products` — paginada (offset, 9.2), ordenável (`?sort=&order=`), filtrável (`species`, `category`, `tag` repetível, `brand`, `minPrice`, `maxPrice`, `status` só staff, `inStock`, `q` — busca da 9.9).
- ⬜ `GET /products/:idOrSlug` — detalhe com variantes.
- ⬜ Views por capability (presenter Zod), resolvidas pelas features da 9.1: `read:product:internal` destrava `stockQuantity` exato e os produtos `DRAFT`/`DISCONTINUED`; `read:product:cost` destrava `costCents`/margem. Sem nenhuma das duas (inclusive **anônimo**), sai a view pública, com disponibilidade (booleano derivado) no lugar da quantidade.
- ⬜ Depende da **autenticação opcional** da 9.6: sem ator, view pública; com ator, view pela capability — e nunca 401 nas rotas de leitura.
- 🔸 **Pendência** (nasceu na 9.1): `?status=` é filtro de quem tem `read:product:internal`. Perguntar ao usuário o que acontece quando um anônimo o envia — **422** (coerente com o filtro estrito da 7.7, mas revela que o parâmetro existe) ou **ignorar silenciosamente** (a vitrine nunca vaza a existência do rascunho).
- ⬜ Teste de contrato: view pública não contém `costCents` nem `stockQuantity`.
- ⬜ Faixa de preço filtra pelas **variantes** (produto entra se alguma variante estiver na faixa) — documentar, é contraintuitivo.
- 🔸 **Pendência** (ver §9.5 do `fase-9-contexto.md`): `GET /products/:idOrSlug` aceitando id **e** slug é ambíguo de contrato (o que acontece se um slug for um UUID válido?) — alternativa: rotas separadas, ou só id com slug em query (`?slug=`).
- 🔸 **Pendência** (ver §9.6 do `fase-9-contexto.md`): ordenação por preço com N variantes — menor preço entre variantes ativas? preço da variante default? produto aparece uma vez por variante?
- ⬜ Testes: filtros combinados; view por capability (cliente vs. staff); paginação+ordenação com tiebreaker; faixa de preço via variante.

### ⬜ [Sessão 9.9] Fase 9.9 — Busca textual
> Ver ADR `docs/adr/text-search.md` para as armadilhas conhecidas antes de começar.
- ⬜ Migration manual com `CREATE EXTENSION` (`unaccent`, `pg_trgm`) — dev, test e prod precisam das extensões.
- ⬜ Coluna `tsvector` gerada (wrapper `IMMUTABLE` sobre `unaccent`, ou trigger — decidir na implementação e registrar a escolha no ADR) com `setweight` (nome pesa mais que descrição/marca/tag).
- ⬜ Índices GIN (`tsvector`) e GIN `gin_trgm_ops` (trigram) — sem eles a busca funciona e é lenta.
- ⬜ Estratégia de consulta: full-text com `websearch_to_tsquery` + `ts_rank` primeiro; fallback para similaridade `pg_trgm` se vazio/pobre (ou pontuação combinada — calibrar na implementação).
- ⬜ SQL cru só no **repository**, via `$queryRaw` parametrizado (nunca concatenação).
- ⬜ `pg_trgm.similarity_threshold`/`set_limit` por query (não por sessão — pool de conexões).
- ⬜ Testes de comportamento observável, não de forma de query: "buscar `racao golden` encontra 'Ração Golden Adulto'"; "buscar `golen` (typo) encontra"; "buscar `xyzabc` não encontra"; "resultado mais relevante vem primeiro".

### ⬜ [Sessão 9.10] Fase 9.10 — Adaptador de storage + upload de imagem
- ⬜ Adaptador de storage (`put`/`delete`/`url`) com implementação `LocalDiskStorage`; volume Docker montado no container; path salvo no banco (nunca URL completa — base derivada de env var).
- ⬜ `POST /products/:id/images` (multipart), `DELETE /images/:id`, `PATCH /products/:id/images/ordem` (formato de reordenação a definir na implementação).
- ⬜ Reverse proxy serve `/uploads/*` como estático, sem passar por Node.
- ⬜ Validação por magic bytes (não `Content-Type`/extensão); nome de arquivo gerado por nós (uuid — nunca nome do usuário, vetor de path traversal); teto de tamanho e de quantidade por produto; normalização/redimensionamento via `sharp`.
- ⬜ Órfãos: exclusão de produto remove arquivo no mesmo fluxo; script de varredura (`src/scripts/` + systemd timer em `infra/cron/`, se necessário) para os que escaparem.
- ⬜ Ordem de escrita: disco antes da linha; linha falha → apaga o arquivo (disco não participa da transação do Postgres).
- ⬜ Role `demo` sem acesso de upload (teste explícito); `demo-reset` passa a limpar o diretório de upload sob `DEMO_MODE=true`; rate limit próprio para o endpoint + teto de tamanho agressivo.
- ⬜ Logo de marca: **`Brand.logoPath` nasceu órfã na 9.6**, pelo mesmo motivo da `Pet.photoPath` (evitar uma migration de um campo só). O `PATCH /brands/:brandId` **recusa** `logoPath` no corpo (422), então o upload é o único caminho. Se esta sessão não cobrir marca, a coluna segue órfã e isso precisa ser dito no fecho da fase.
- ⬜ Foto de pet: **`Pet.photoPath` já existe no schema desde a 9.4 e não tem endpoint que a preencha** — a coluna nasceu órfã de propósito (evitar uma migration de um campo só), e é aqui que ela ganha dono. O `PATCH /pets/:petId` recusa `photoPath` no corpo (422), então o upload é o **único** caminho; se esta sessão não cobrir pet, a coluna segue órfã e isso precisa ser dito em voz alta no fecho da fase.
- ⬜ Env vars novas em `.env.example` (diretório de upload, teto de tamanho, base URL pública) — nomes definidos aqui, na implementação.
- ⬜ Testes: magic bytes recusa arquivo disfarçado; nome do usuário nunca chega ao disco; teto de tamanho/quantidade; órfão removido pela varredura; demo não sobe arquivo.

### ⬜ [Sessão 9.11] Fase 9.11 — Seed fake do domínio + `demo-reset`
- ⬜ `src/lib/seed/fakePets.constants.ts` (já anunciado em comentário de `fakeUsers.constants.ts`), amarrado aos customers fake existentes por email fixo. **Herdado da 9.4:** o molde de escrita é `tests/factories/pet.factory.ts` (parse pelo schema do módulo → `petRepository.createPet` sem audit); a raça se resolve por **nome** (`SRD_BREED_NAME`) sobre o catálogo já semeado, nunca por id fixo; e `microchipId` é unique global, então o roster precisa de números distintos e idempotência por chave estável.
- ⬜ Dataset fake de catálogo (marca, categoria, tag, produto, variante) coerente, para o demo não mostrar listas vazias. **Herdado da 9.6:** marca/categoria/tag são **transacionais** (entram no truncate do `demo-reset` e já entraram no `clearDatabase`), diferente de `Breed`; a categoria precisa ser semeada **de cima para baixo** por causa da self-FK, e nome/slug são unique global, então a idempotência é por slug estável.
- ⬜ Roster fake ganha um funcionário de cada role nova da 9.1 (`stockist`, `catalog-manager`) — sem eles as duas roles existem só no seed e ninguém consegue exercitá-las em dev/demo.
- ⬜ `demo-reset.ts` passa a truncar/restaurar as tabelas transacionais novas (produtos, variantes). **`pet` já entrou na 9.4** (nos três pontos do script, antes de `customer` — a FK é RESTRICT), e **`Breed` já está confirmado na 9.3** como catálogo de referência tipo `Role`/`Feature`: preservado, não truncado, nem no `demo-reset` nem no `clearDatabase` dos testes.
- ⬜ `demo-reset.ts` passa a limpar o diretório de upload (dependência da 9.10).
- ⬜ Marcar como resolvida a entrada "Dummy data para a demo" do `docs/reference/backlog.md` ao fechar esta sessão.
- ⬜ Testes: seed idempotente; demo-reset restaura pets/produtos fake e limpa uploads.

### ⬜ [Sessão 9.12] Fase 9.12 — Fechos
- ⬜ `docs/reference/endpoints.md` — as rotas novas de catálogo, e a seção "Mounting" com a categoria nova de autenticação opcional (rotas públicas que enriquecem a resposta quando há token). **`breeds` (9.3) e `pets` (9.4) já entraram**; conferir, não reescrever.
- ⬜ `README.md`/`docs/context/authorization.md` — conferir que as roles novas (`stockist`, `catalog-manager`) aparecem onde o projeto descreve os cargos.
- ⬜ Coleção Bruno — pastas novas por módulo (`products`, `variants`), environments `local`/`prod`. `breeds/` já entrou na 9.3, `pets/` na 9.4 (com `Get Me` gravando `customerId`, que é o que encadeia a coleção aninhada) e `brands/`, `categories/`, `tags/` na 9.6 — conferir, não reescrever.
- ⬜ `docs/context/pet-domain.md` promovido de "planejada" a "implementada"; parágrafo "Fase 9 (fechada)" em `docs/context/history.md`; decisões novas indexadas em `docs/context.md`.
- ⬜ `docs/reference/logging-policy.md` — conferir a taxonomia final (ações de catálogo que a 9.7 tiver definido). As quatro de pet e o `targetType` `Pet` já foram ligados na 9.4, junto de `cascadedPets`/`restoredPets` nas ações de ciclo de vida.
- ⬜ `docs/reference/backlog.md` revisado — nenhum item resolvido pela fase sem marcação, nenhuma entrada nova esquecida.
- ⬜ `README.md` — roadmap promove a Fase 9 a ✅, contagem de testes atualizada.
- ⬜ Decisão do usuário: apagar `docs/planning/fase-9-contexto.md` ou mantê-lo em `docs/planning/` como registro histórico.
- ⬜ `npm run typecheck` + `npm run lint` + suíte completa verdes; Fase 9 marcada ✅.
