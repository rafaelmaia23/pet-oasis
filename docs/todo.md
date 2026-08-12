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
> estão na forma resumida; o racional completo vive no `docs/context.md` (§2.x) e nos ADRs.

## Fase 2 — Autorização e perfis ✅
> RBAC + CRUD de user com modelo de perfis. Regras e racional no `docs/context.md` (§1, §2).
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
> Migrou de "JWT-como-Session validado no banco a cada request" para "access JWT 15min validado local + refresh opaco rotativo". Design e racional no `docs/context.md` (§2, §3).
- `Session` reshaped: `refreshTokenHash`/`usedAt`/`userAgent`/`ipAddress` (sem `token`). `src/lib/token.ts` (gera/hash opaco).
- `authenticate` reescrito (valida JWT só localmente, sem hit no banco), movido de global → por-grupo-de-rota; erros via `create*Error` (idem `canAccess`).
- Endpoints: `POST /auth/login` (sempre cria Session nova), `POST /auth/refresh` (rotação + detecção de roubo por reuso → invalida todas as sessões), `POST /auth/logout` (por refresh cookie + ownership), `GET /auth/sessions` (só vivas), `DELETE /auth/sessions/:id` (404 unificado "não existe/morta").
- Features `read:session`/`manage:session` (substituem `logout:session`).
- Distinção de critério `invalidateAllUserSessions` (resposta a roubo, mantém `usedAt`) vs `softDeleteUserAndInvalidateSessions` (encerra conta, filtra `usedAt`).

---

## Fase 4 — Email, status de conta e banimento ✅
> Status de conta com verificação de email obrigatória, serviço de email genérico (nodemailer; mailpit em dev / Resend em prod), recuperação/troca de senha e banimento. Regras e racional no `docs/context.md` (§2.1, §4).
- Modelo de status: `enum UserStatus { PENDING, ACTIVE }` + `bannedAt`/`bannedBy`/`banReason` ortogonais (idioma `deletedAt`); loga só com `status == ACTIVE && bannedAt == null`; desbanir limpa as três colunas e preserva o `status`.
- `VerificationToken` genérico (`purpose: EMAIL_VERIFICATION | PASSWORD_RESET`, hash salvo, TTL por purpose) + `src/lib/email.ts` (`send`, erro → 503).
- Verificação: todo user novo nasce `PENDING` (signup e `POST /users`); `POST /auth/verify-email` (204) + `/verify-email/resend` (sempre 200 genérico); orquestração em `verification.service.ts` (evita ciclo `auth`↔`user`); token ruim → 400 genérico.
- Recuperação/troca de senha: `POST /auth/forgot-password` (200 genérico) + `/reset-password` (204, token single-use, invalida TODAS as sessões) + `/change-password` logado (403 se senha atual errada, também invalida todas as sessões).
- Banimento: `POST`/`DELETE /users/:id/ban` `{ reason }` (`manage:user:status`); `assertAdminForBan` (features efetivas do alvo, não da role); auto-ban/-unban → 409; conta banida = "congelada" (login/forgot/resend/reset/change bloqueados, sessões derrubadas), **204** em ambos.
- Fechos: 2 bugs pré-existentes corrigidos — `getUserById` passou a autorizar antes de buscar (403 vence 404) e JSON malformado do body-parser virou **400** (era 500). Adotado o fluxo de branches por fase (`main` → `fase-<n>` → `feat/...`). Nasceu o `docs/endpoints.md`.
- Suíte (329) + `typecheck` + `lint` verdes ao fechar.

---

## Fase 5 — Documentação da API + Containerização (deploy) ✅
> Fecha o Ciclo 1 como peça de portfólio: OpenAPI gerado dos schemas Zod → UI Scalar → coleção Bruno, usuário demo read-only, e deploy via Docker do zero. Racional no `docs/context.md` (§2.3, §4).
- OpenAPI 3.1 via `zod-openapi` + `.meta()` nativo do Zod 4 (sem monkey-patch) — schemas/presenters viram componentes nomeados; **`GET /openapi.json`** (público, router de topo, `servers: [{url:"/api/v1"}]`); doc verificada sem `passwordHash`/`tokenHash`/`refreshTokenHash`.
- UI Scalar interativa em **`GET /reference`** (público), consumindo `/openapi.json`, Bearer preenchível no "try it".
- Usuário demo read-only: role `demo` (`appliesTo EMPLOYEE`, só features de leitura) sempre semeada; usuário demo só nasce com `SEED_DEMO_USER=true` (ligado em Docker/prod, desligado em test/dev).
- `README.md` (novo) e coleção **Bruno** versionada em `api-collection/` (por módulo, environments `local`/`prod`); login encadeia o token via `bru.setVar` (não `setEnvVar` — não grava segredo no `.bru` versionado).
- Containerização: `Dockerfile` multi-stage não-root (client Prisma embutido no bundle via tsup, `src/generated` não copiado ao runtime); serviço `app` no compose sob profile `full`, derivando a própria `DATABASE_URL` (`@db`); entrypoint `migrate deploy → seed → start` (seed bundlado, `dist/seed.js`). Deploy documentado no `README.md`.
- Suíte (335) + `typecheck` + `lint` verdes ao fechar; nasceu o `docs/endpoints.md` § "Docs".

---

## Fase 6 — Ambientes, Docker por ambiente e deploy ✅
> Reformula dev/test/prod para Compose base + overrides por ambiente, corrige dois bugs de deploy (SMTP hardcodado pro mailpit em vez da Resend; prod subindo db/mailpit de dev) e adiciona graceful shutdown. Nenhuma regra de negócio nova. Racional no `docs/context.md` (§2.4, §4) e ADR `docs/adr/environments-and-deploy.md`.
- Envs por arquivo: `.env.{development,test,production}` (fora do git) + `.env.example`; `dotenv-cli` na autoria de migration; `vitest.config.ts` carrega `.env.test` (`npx vitest run <arquivo>` funciona sozinho).
- `src/lib/shutdown.ts` (`createShutdownHandler`, injeção de dependência): `server.close()` → `prisma.$disconnect()` → exit, timeout de força-saída; `server.ts` registra SIGTERM/SIGINT.
- Compose **base + overrides** (`.dev`/`.prod`/`.test`), isolados por `-p pet-oasis-{dev,test,prod}`: prod só `app` + Postgres-de-prod (mata os dois bugs); dev com bind-mount + client Prisma em volume anônimo; stage `dev` do Dockerfile roda como root (evita EACCES no bind-mount).
- Scripts por ambiente: `dev`/`dev:down`/`dev:reset`/`dev:mail`, `prod:up`/`prod:down`/`prod:logs`, `test` (teardown garantido por trap de EXIT) — substituem os antigos `services:*`/`stack:*`.
- Teste-guarda `clearDatabase.guard.test.ts` (Feature/Role/RoleFeature sobrevivem ao `clearDatabase` de propósito — não era bug).
- `typecheck` + `lint` + suíte verdes; verificação ponta a ponta dos 3 ambientes ao fechar.

---

## Fase 7 — Hardening e observabilidade ✅
> Ampliou o escopo original do roadmap ("rate limiting, account lockout") para observabilidade completa e polimento das features de conta já construídas. 9 sessões de trabalho (A–I), sub-fases 7.0–7.19, cada uma em feat-branch própria. Racional no `docs/context.md` (§2.2, §4), em `docs/logging-policy.md` e nos ADRs `rate-limiting-and-lockout.md` / `pagination.md`.
- Infra e bordas (7.0–7.2): serviço `redis` nos três overrides do Compose (dev 6379 · test 6380 · prod sem porta publicada) e client `ioredis` que **falha rápido** — é isso que torna o fail-open real, não a decisão sozinha; `app.set("trust proxy", 1)`; `express.json({ limit })` com corpo grande virando **413** (era 500); helmet com CSP mais estrita que o default, bundle do Scalar **auto-hospedado** (`GET /scalar/standalone.js`) + nonce por request; CORS por allowlist; os 3 guards de escalação consolidados em `assertActorIsAdmin` (`lib/authorization.ts`).
- Observabilidade (7.3–7.6): `pino` com streams por ambiente (test escreve **só** no ring buffer — suíte silenciosa e ainda assim assertável), `redact` da política, `AsyncLocalStorage` com `requestId` ecoado no header e no corpo de erro; access log (`pino-http`, rotas de ruído em `debug`), application log por `logger.child({ module })`, error handler com ponto único de saída; `AuditLog` com taxonomia fechada como union em tempo de compilação, `record(descriptor, tx?)`, gravação transacional feita pelo **repository** (o service passa o descritor) e `metadata` só com ids/enums.
- Contrato de leitura (7.7–7.8): helper `src/lib/pagination.ts` com as duas estratégias (offset e cursor, com tiebreaker obrigatório por `id`), envelope `{ data, meta }` em **todas** as listagens (exceto `GET /users/:userId/permissions`), filtros estritos em `GET /users` (fora da allowlist → 422); `GET /audit-logs` (cursor + filtros, `ip` mascarado para quem não tem `read:audit-log:full`, só `GET`) e `GET /logs/recent` (ring buffer, limitação declarada no `meta`).
- Abuso e resiliência (7.9–7.12): rate limit por IP e por **email destinatário**; account lockout por conta (janela fixa → backoff exponencial, estado só no Redis, transição pura `applyFailure`, checado no ramo de senha correta) + `DELETE /users/:id/lock`; **fail-open** nos dois quando o Redis cai; Axiom (worker thread, `flush` no shutdown) e Sentry (só falha ≥500, `beforeSend` reusando a lista de campos proibidos do pino) opcionais por env var; timeouts em HTTP server, Prisma, Redis e SMTP.
- Higiene (7.13–7.14): teto de sessões vivas (`MAX_LIVE_SESSIONS`, evict da mais antiga — login nunca é recusado); scripts `cleanup-sessions`, `cleanup-audit-log` e `demo-reset` com `--dry-run`, transação e resultado no log, agendados por systemd timer em `infra/cron/`; `demo-reset` é truncate+reseed guardado por `DEMO_MODE=true`.
- Polimento de conta (7.15–7.17, desenho confirmado com o usuário em 2026-08-03): troca de email em 2 passos (`POST /auth/change-email` + `/auth/confirm-email-change`, aviso de segurança para o email **antigo**, alvo gravado no próprio token); `POST /users/:id/force-password-reset` (bloqueia o login inteiro até o reset, volta pelo mesmo fluxo do `forgot-password`); `GET /auth/sessions` com `device` parseado do user-agent e `current`.
- Fechos (7.18–7.19): "refresh token hasheado em repouso" já valia desde a Fase 3 (D1) — virou teste de regressão, não código novo; documentação da fase sincronizada. Suíte (606) + `typecheck` + `lint` verdes ao fechar.

---

## Seed de dados fake (usuários) ✅
> Trabalho pontual entre as Fases 7 e 8 — não é fase numerada; branch `feat/seed-fake-data-users` direto da `main`. Racional no `docs/context.md` (§2.5).
- Duas flags independentes: **`SEED_FAKE_DATA`** (20 usuários — customers, employees, híbridos, e os cenários banido / pendente de verificação / soft-deletado, com senha compartilhada) e **`SEED_ADMIN_USER`** (acesso total, **nunca ligada em produção/demo** — decisão firmada com o usuário).
- Roster declarativo em `src/lib/seed/fakeUsers.constants.ts`, com email fixo como chave de idempotência **ignorando `deletedAt`** (o entrypoint roda o seed a cada boot, sem truncate antes); criação via `userRepository` e serviços reais de perfil/ban — nunca via `user.service`, que dispararia email de verificação a cada restart.
- `@faker-js/faker` e `cpf-cnpj-validator` migraram para `dependencies` (viraram código de produção, bundlado). Achado corrigido junto: `demo-reset.ts` não truncava `previousEmail`.
- Testes de integração em `tests/integration/lib/seed/` + verificação manual com o bundle real (`dist/seed.js`/`dist/demo-reset.js`). Suíte (618) + `typecheck` + `lint` verdes.

---

## Fase 8 — Autorização com escopo, cascata de deleção e reativação ✅
> **Única fase implementada, revertida e refeita.** O desenho original construiu a reativação de conta em cima de dois bugs pré-existentes (deleção que não cascateava; override de feature sem escopo) e boa parte da complexidade existia só para contorná-los; o código foi revertido para `d1b8478` em 2026-08-07 e a fase refeita com o escopo ampliado — consertar o modelo antes de construir sobre ele. 7 sessões (A–G), sub-fases 8.0–8.9, mais três "Passo 0" pontuais em branch própria. Racional no `docs/context.md` (§2.6, §3, §4) e no ADR `docs/adr/authorization-scope-and-lifecycle.md`; o documento de trabalho `docs/fase-8-redesign.md` foi dissolvido na 8.9.
- Modelo de autorização (8.0): `UserFeature.userId` → **`userRoleId`** (o override pendura na atribuição de role) + `@@unique([userRoleId, featureId])`; `UserRole` ganhou `grantedAt` e `@@unique([userId, roleId])`, com **reuso de linha** na re-concessão (201 em qualquer caso; 409 só para role já ativa); contrato `PUT|DELETE /users/:userId/roles/:roleId/features/:featureId` (422 nomeando `roleId` quando falta a role ativa; 404 seco no `DELETE`, que não revela se o usuário tem a role); `computeEffectiveFeatures` virou dois laços (todas as estáticas antes de qualquer override); a migration **zerou o banco** (só havia o demo de portfólio no ar). Fechou junto um buraco pré-existente: o guard de escalação não via override do wildcard `*`.
- Passos 0 (trabalho pontual, cada um em branch própria antes da sub-fase que dependia dele): `Role.appliesTo` virou **NOT NULL** (três branches mortos apagados, suíte inteira passou sem alteração); revogação do D6/D16 — a restauração deixou de ressuscitar override, e toda a máquina de política de restauração foi apagada; `restoreProfile` deixou de exigir instante exato — perfil **nomeado** volta mesmo tendo morrido antes da conta.
- Cascata de deleção (8.1): desce quatro níveis (`User` → perfis → `UserRole` → `UserFeature`) com **um único `new Date()` por transação**, concentrada em `src/modules/user/user.lifecycle.repository.ts`; só toca linha ativa (o que já estava morto mantém o timestamp antigo, e é isso que preserva a distinção na restauração); audit ganhou `USER_PROFILE_DELETED` e contagens de cascata na metadata, passadas como thunk porque só existem dentro da transação.
- Restauração (8.2): sobe dois níveis, com uma regra recursiva só — restaura o filho cujo `deletedAt` é **igual** ao do pai, lendo o `deletedAt` do pai **antes** de zerá-lo. Perfil volta por ser **nomeado**; roles do perfil, por correlação de data; override nunca volta por efeito colateral (só por `PUT` explícito na tripla, que revive a linha).
- Perfil em conta ativa (8.3): a **mesma rota cria ou reativa** (201 nos dois ramos, quem ramifica é o service); o catálogo passou a nomear o recurso — `create:customer-profile`/`reactivate:customer-profile` (self, em `SELF_MANAGEMENT_FEATURES`, porque a role `customer` morre junto com o perfil), variantes `:others` no grupo novo `CUSTOMER_SERVICE_FEATURES`, e o par de funcionário em `USER_ADMINISTRATION_FEATURES`; `create:*` e `reactivate:*` ficam separadas de propósito (poderes diferentes, concedíveis em separado). `canAccess` ganhou a forma OR e a autorização virou duas etapas (união das features antes da busca — 403 vence 404 —, específica do ramo depois). Furo pré-existente fechado: `POST /users` aceitava `roleNames` sem rodar a não-escalação.
- Conta deletada (8.4/8.5): volta pelo **signup** (email de conta morta + cpf batendo → **202**; cpf que não bate, conta banida ou conta ativa → o mesmo 409 genérico) ou por **`POST /users/:id/reactivate`** (feature nova `reactivate:user`, admin escolhe perfis e roles, 204). Nenhum dos dois reativa sozinho: ambos só emitem token, e quem conclui é o dono em `POST /auth/confirm-account-reactivation` (público, senha nova obrigatória, `phone` exigido só quando o perfil de cliente nasce do zero). Self-service nunca traz funcionário; `roleNames` significa "com que roles a conta volta" (restaura ou concede); a não-escalação roda por role que vai voltar, **antes de qualquer escrita**.
- Transversais (8.6–8.8): `PreviousEmail` parou de bloquear qualquer cadastro e perdeu o `@unique` global (continua como histórico); o rate limit cobriu as superfícies novas (mesmo balde por email-alvo do `forgot-password`) e as três rotas públicas de token (`tokenIpLimiter`), com o `Retry-After` migrando para `AppError.headers` — o que permitiu consumir limite de dentro de um service; conta com a role `demo` ficou isenta do account lockout (bug de produção pós-deploy da Fase 7 — senha pública transforma lockout por conta em DoS).
- Fechos (8.9): auditoria de doc antes da correção — sete afirmações envelhecidas durante a fase, a pior delas o `docs/endpoints.md` descrevendo o **inverso** do D6'; `docs/context.md` ganhou a §2.6 (o racional morava espalhado no §3) e nasceu o ADR `authorization-scope-and-lifecycle.md`; varredura **por script** provando que as 43 rotas batem em `endpoints.md`, OpenAPI e coleção Bruno. Suíte (**719**) + `typecheck` + `lint` verdes.

---

# Ciclo 2 — Domínio pet shop (Fases 9–10)

> Abre o domínio do pet shop em si. A numeração das fases **continua global** (9, 10, …): o
> ciclo é agrupamento de leitura, não reinício de contagem — a convenção de branch do
> `CLAUDE.md` (`fase-<n>`, `feat/fase-<n>-<m>-<slug>`) depende de um número único por fase.
> A Fase 9 traz pets e catálogo, ainda **sem checkout**; a Fase 10 traz carrinho, pedido e
> pagamento.

## Fase 9 — Domínio pet shop: pets e catálogo

> Planejada em 2026-08-06, sessão de brainstorming/decisão consumida de
> `docs/planning/fase-9-contexto.md` (mantido ou apagado ao final da fase — decisão do
> usuário). Duas agregações praticamente independentes — **Bloco A** (pets, ligados a
> `Customer`) e **Bloco B** (catálogo: marca/categoria/tag/produto/variante) — que só se
> tocam na faceta "para qual espécie este produto serve". Carrinho, pedido e pagamento
> ficam para a **Fase 10**. Racional completo no `docs/context.md` §2.7, ADRs novos em
> `docs/adr/` (`pet-domain-modeling.md`, `product-catalog-modeling.md`,
> `product-vs-service.md`, `text-search.md`, `file-storage-and-uploads.md`, e um adendo em
> `pagination.md`), itens deixados de fora no `docs/backlog.md`.
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

### Sessões de trabalho

Diferente da Fase 8, aqui cada sessão é 1:1 com sua sub-fase (9.1 a 9.12) — sem
agrupamento de várias sub-fases numa mesma feat-branch.

| Sessão | Tema | Por que nesta posição |
|---|---|---|
| **9.1** | RBAC do domínio — decisão + seed | Toda rota nova precisa de feature. Sessão de **decisão com o usuário**, praticamente sem código. Nenhuma outra sessão começa antes desta fechar. |
| **9.2** | Ordenação configurável no helper de paginação | Dívida do `docs/backlog.md`. Habilita todas as listagens da fase — fazer antes evita retrabalho em cada uma. |
| **9.3** | Espécies, raças e seed de `Breed` | Pré-requisito do CRUD de pets. |
| **9.4** | Pets — CRUD, escopo próprio | Núcleo do Bloco A. |
| **9.5** | Pets — escopo staff, listagem geral, filtros | Depende de 9.2 e 9.4. |
| **9.6** | Taxonomia do catálogo — `Brand`, `Category` (árvore), `Tag` | Pré-requisito de `Product`. |
| **9.7** | `Product` + `ProductVariant` — escrita | Núcleo do Bloco B. |
| **9.8** | Catálogo — leitura, views por capability, filtros | Depende de 9.2, 9.6, 9.7. |
| **9.9** | Busca textual | Depende de 9.8 existir para ter o que buscar. Maior risco técnico da fase — isolada de propósito. |
| **9.10** | Adaptador de storage + upload de imagem | Independente do resto — mais infra, menos domínio. |
| **9.11** | Seed fake do domínio + `demo-reset` | Depende do schema inteiro estar firme. Resolve a entrada "Dummy data para a demo" do `docs/backlog.md`. |
| **9.12** | Fechos | Docs, coleção Bruno, README, `context.md`, revisão do backlog. |

### ⬜ [Sessão 9.1] Fase 9.1 — RBAC do domínio: decisão + seed
> Sessão de conversa, não de código. Ver §9.1 do `docs/planning/fase-9-contexto.md`.
- 🔸 **Pendência:** nomes das features de pet (`create:pet`, `read:pet` + variantes `:others`) e de catálogo (`create:product`, `manage:catalog`, `read:product:internal`, …).
- 🔸 **Pendência:** granularidade — uma feature por operação por recurso (mais precisa, catálogo maior) vs. features agrupadas por domínio (`manage:catalog` cobrindo marca/categoria/tag — mais enxuto, menos flexível para override).
- 🔸 **Pendência:** quais roles recebem o quê. Já decidido: atendente cadastra pet no nome de um cliente (`:others`). Em aberto: quem cadastra produto, quem mexe em estoque, quem vê custo/margem.
- 🔸 **Pendência:** nascem roles novas de funcionário (`stockist`, `catalog-manager`)? Hoje `attendant` só tem self-management; o catálogo pode cair em `manager` ou justificar role própria.
- 🔸 **Pendência:** a role `demo` precisa das features de leitura novas, senão o demo público mostra 403 onde deveria mostrar catálogo.
- 🔸 **Pendência:** alguma feature nova é privilegiada (entra em `PRIVILEGED_FEATURES`)? Custo e margem são candidatos.
- ⬜ Nomes definidos entram em `feature.constants.ts`/`role.constants.ts`; reseed necessário.

### ⬜ [Sessão 9.2] Fase 9.2 — Ordenação configurável no helper de paginação
- ⬜ `?sort=<campo>&order=asc|desc` no helper de paginação **offset** (`src/lib/pagination.ts`).
- ⬜ Allowlist de campos ordenáveis por recurso — campo fora da allowlist → **422** (nunca vai cru para o `orderBy`).
- ⬜ Tiebreaker por `id` obrigatório mesmo com `?sort=` — mesma lição da 7.7 (cursor).
- ⬜ Ordenação entra **só no offset**; a limitação do cursor permanece documentada no `docs/backlog.md`.
- ⬜ Conferir que a implementação bate com o desenho já registrado no adendo de `docs/adr/pagination.md` (escrito no planejamento da fase, antes do código).
- ⬜ Testes: campo fora da allowlist → 422; ordenação asc/desc corretas; tiebreaker por id evita duplicata/omissão com valores repetidos no campo de ordenação.

### ⬜ [Sessão 9.3] Fase 9.3 — Espécies, raças e seed de `Breed`
- ⬜ `enum PetSpecies { DOG CAT RABBIT BIRD RODENT REPTILE FISH }` no schema.
- ⬜ Model `Breed` (`id`, `name`, `species`, `@@unique([species, name])`).
- ⬜ Curadoria da constante de raças em `src/lib/seed/` — puxada uma vez de API pública, nomes em pt-BR, sem duplicata/ruído; nunca mais consultada em runtime.
- ⬜ `SPECIES_WITH_BREED` — constante explícita ao lado do enum.
- ⬜ Linha **"SRD" (sem raça definida)** semeada para toda espécie com raça.
- ⬜ Seed idempotente por `@@unique([species, name])`, mesmo padrão de `DEFAULT_ROLES`/`DEFAULT_FEATURES`.
- ⬜ `GET /breeds?species=DOG` — leitura pública (popula select do frontend).
- ⬜ Testes: seed idempotente (rerun não duplica); filtro por espécie; SRD presente em toda espécie com raça.

### ⬜ [Sessão 9.4] Fase 9.4 — Pets: CRUD, escopo próprio
- ⬜ `enum PetSex { MALE FEMALE UNKNOWN }`; model `Pet` completo (`customerId`, `name`, `species`, `breedId?`, `sex`, `birthDate?`, `birthDateIsEstimated`, `weightGrams?`, `neutered`, `microchipId?`, `color?`, `notes?`, `photoPath?`, `deceasedAt?`, soft delete — ver §2.3 do `fase-9-contexto.md`).
- ⬜ `POST /customers/:customerId/pets`, `GET /customers/:customerId/pets`, `GET /pets/:petId`, `PATCH /pets/:petId`, `DELETE /pets/:petId` (soft delete).
- ⬜ Autorização escopo `own`/`:others`, com os nomes de feature decididos na 9.1.
- ⬜ Validação semântica no service (422): espécie em `SPECIES_WITH_BREED` exige `breedId`; espécie fora dela exige `breedId` ausente; raça informada precisa pertencer à espécie informada.
- 🔸 **Pendência** (ver §9.3 do `fase-9-contexto.md`): unicidade de `microchipId` — unique global (aceita prender o valor de pet excluído) vs. unique parcial (`WHERE deleted_at IS NULL`, migration manual) vs. sem unique + validação no service. Agravante: duplicata pode ser erro de digitação ou pet transferido entre clientes (backlog).
- 🔸 **Pendência** (ver §9.9 do `fase-9-contexto.md`): pets de um cliente soft-deletado voltam automaticamente na reativação de perfil da Fase 8, ou a reativação escolhe?
- ⬜ Falecimento como estado distinto de exclusão (`deceasedAt`).
- ⬜ Testes: CRUD completo; 422 dos três casos de raça/espécie; escopo `own` recusa acesso a pet de outro customer; escopo `:others` (atendente) cadastra/edita pet no nome de um cliente; falecimento não remove o pet da listagem do dono.

### ⬜ [Sessão 9.5] Fase 9.5 — Pets: escopo staff, listagem geral, filtros
- ⬜ `GET /pets` — listagem geral para staff, paginada (offset, helper da 9.2) e filtrável.
- ⬜ Ordenação via `?sort=&order=` (helper da 9.2).
- ⬜ Testes: staff vê todos os pets; customer sem `:others` não acessa `GET /pets`; filtros combinados; ordenação com tiebreaker.

### ⬜ [Sessão 9.6] Fase 9.6 — Taxonomia do catálogo: `Brand`, `Category` (árvore), `Tag`
- ⬜ Model `Brand` (`id`, `name` @unique, `slug` @unique, `description?`, `logoPath?`, soft delete).
- ⬜ Model `Category` em árvore (`parentId?` auto-relação, `position`, soft delete) — `ProductCategory` N:N com **mínimo de uma** por produto.
- ⬜ Model `Tag` (`id`, `name` @unique, `slug` @unique) — `ProductTag` N:N **sem** mínimo.
- ⬜ `GET/POST/PATCH/DELETE /categories`, `/brands`, `/tags`.
- 🔸 **Pendência** (ver §9.2 do `fase-9-contexto.md`): catálogo público (sem token) ou autenticado? Primeira sessão do Bloco B a expor leitura — decide se `GET /categories|/brands|/tags` (e depois `/products`) responde sem Bearer. Consequências reais: rate limit próprio, cache (Redis já disponível), view à prova de vazamento por definição, não por permissão.
- 🔸 **Pendência** (ver §9.7 do `fase-9-contexto.md`): regras da árvore de categoria — profundidade máxima? categoria com filhos pode ser excluída? produto vincula só a folha ou também categoria intermediária? excluir categoria com produtos vinculados bloqueia (409) ou desvincula?
- 🔸 **Pendência** (ver §9.8 do `fase-9-contexto.md`): slug gerado a partir do nome (o que acontece quando o nome muda?) ou informado pelo staff (controle total, risco de colisão/slug feio)? Decisão vale para `Category`/`Brand`/`Tag` aqui e é reaplicada em `Product` na 9.7.
- ⬜ Testes: árvore de categoria (criação, ciclo em `parentId` recusado); N:N de categoria com mínimo de uma; tag sem mínimo.

### ⬜ [Sessão 9.7] Fase 9.7 — `Product` + `ProductVariant`: escrita
- ⬜ `enum ProductStatus { DRAFT ACTIVE DISCONTINUED }`; model `Product` (`targetSpecies: PetSpecies[]`, `brandId`, `status`, soft delete) + `ProductVariant` (`sku` @unique, `priceCents`, `compareAtPriceCents?`, `costCents?`, `stockQuantity`, `weightGrams?`, `volumeMl?`, `sizeLabel?`, `barcode?`, `isDefault`, soft delete).
- ⬜ `POST/PATCH/DELETE /products`, `POST /products/:id/variants`, `PATCH/DELETE /variants/:id` (recurso plano, mesmo racional dos pets).
- ⬜ Todo produto nasce com ≥1 variante — produto "sem variação" ganha variante única `isDefault: true`.
- 🔸 **Pendência** (ver §9.3 do `fase-9-contexto.md`): unicidade de `sku` — unique global vs. unique parcial vs. validação no service (mesmo dilema do `microchipId` da 9.4, já documentado para email/cpf no `docs/backlog.md`).
- 🔸 **Pendência** (ver §9.4 do `fase-9-contexto.md`): estoque pode ficar negativo? Sem carrinho ainda, o único caminho de mudança é edição manual pelo staff — aceitar negativo (registra erro de contagem real) ou barrar em 422?
- 🔸 **Pendência** (ver §9.8 do `fase-9-contexto.md`): slug do produto gerado ou informado — mesma decisão da 9.6, reaplicada aqui.
- ⬜ Testes: produto sem variante é rejeitado; variante default automática quando só uma é criada; validação de `targetSpecies` (array vazio = qualquer espécie).

### ⬜ [Sessão 9.8] Fase 9.8 — Catálogo: leitura, views por capability, filtros
- ⬜ `GET /products` — paginada (offset, 9.2), ordenável (`?sort=&order=`), filtrável (`species`, `category`, `tag` repetível, `brand`, `minPrice`, `maxPrice`, `status` só staff, `inStock`, `q` — busca da 9.9).
- ⬜ `GET /products/:idOrSlug` — detalhe com variantes.
- ⬜ Views por capability (presenter Zod): cliente não vê `costCents`/margem nem `stockQuantity` exato nem produtos `DRAFT`/`DISCONTINUED`; disponibilidade (booleano derivado) substitui quantidade exata na view pública.
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
- ⬜ Foto de pet (`Pet.photoPath`, já no schema da 9.4) reaproveita o mesmo adaptador, se couber nesta sessão.
- ⬜ Env vars novas em `.env.example` (diretório de upload, teto de tamanho, base URL pública) — nomes definidos aqui, na implementação.
- ⬜ Testes: magic bytes recusa arquivo disfarçado; nome do usuário nunca chega ao disco; teto de tamanho/quantidade; órfão removido pela varredura; demo não sobe arquivo.

### ⬜ [Sessão 9.11] Fase 9.11 — Seed fake do domínio + `demo-reset`
- ⬜ `src/lib/seed/fakePets.constants.ts` (já anunciado em comentário de `fakeUsers.constants.ts`), amarrado aos customers fake existentes por email fixo.
- ⬜ Dataset fake de catálogo (marca, categoria, tag, produto, variante) coerente, para o demo não mostrar listas vazias.
- ⬜ `demo-reset.ts` passa a truncar/restaurar as tabelas transacionais novas (pets, produtos, variantes — `Breed` segue como catálogo de referência tipo `Role`/`Feature`, preservado, não truncado — confirmar na implementação).
- ⬜ `demo-reset.ts` passa a limpar o diretório de upload (dependência da 9.10).
- ⬜ Marcar como resolvida a entrada "Dummy data para a demo" do `docs/backlog.md` ao fechar esta sessão.
- ⬜ Testes: seed idempotente; demo-reset restaura pets/produtos fake e limpa uploads.

### ⬜ [Sessão 9.12] Fase 9.12 — Fechos
- ⬜ `docs/endpoints.md` — todas as rotas novas de pet/breed/catálogo.
- ⬜ Coleção Bruno — pastas novas por módulo (`pets`, `breeds`, `products`, `variants`, `categories`, `brands`, `tags`), environments `local`/`prod`.
- ⬜ `docs/context.md` §2.7 promovida de "planejada" a "implementada"; parágrafo "Fase 9 (fechada)" em §4.
- ⬜ `docs/logging-policy.md` — conferir taxonomia final (ações de catálogo que a 9.1/9.7 tiverem definido, além das quatro de pet já registradas no planejamento).
- ⬜ `docs/backlog.md` revisado — nenhum item resolvido pela fase sem marcação, nenhuma entrada nova esquecida.
- ⬜ `README.md` — roadmap promove a Fase 9 a ✅, contagem de testes atualizada.
- ⬜ Decisão do usuário: apagar `docs/planning/fase-9-contexto.md` ou mantê-lo em `docs/planning/` como registro histórico.
- ⬜ `npm run typecheck` + `npm run lint` + suíte completa verdes; Fase 9 marcada ✅.
