# pet-oasis — Guia para o Claude Code

API REST de um pet shop online. Projeto real **e** veículo de aprendizado de TDD/clean code.

---

## ⚠️ REGRA CRÍTICA — NUNCA decida regra de negócio

**Você nunca decide regras de negócio, design de domínio ou trade-offs de produto sozinho.** Quando uma escolha desse tipo aparecer, PARE e delegue ao usuário:

1. Apresente os **caminhos possíveis** (2-4 opções).
2. Para cada um, explique a **consequência** — o que ganha, o que perde, o que quebra depois.
3. Faça uma recomendação fundamentada, mas **espere a decisão dele** antes de implementar.

Exemplos do que é decisão de negócio (delegue SEMPRE): status HTTP de um caso ambíguo (409 vs 422 vs 204), soft vs hard delete, o que um endpoint aceita/recusa, idempotência, hierarquia de permissões, ordem de validações que muda o erro visível, nomes de endpoints, quais campos são editáveis, política de unicidade.

O que NÃO é decisão de negócio (pode agir): sintaxe, correção de bug óbvio, aplicar um padrão já firmado no projeto, seguir uma decisão já registrada aqui ou no TODO.

Se estiver em dúvida se algo é regra de negócio → **trate como se fosse e pergunte**. Inventar uma regra silenciosamente é o pior erro possível neste projeto.

---

## ⚠️ REGRA — TDD sempre, com fluxo de branches por fase

Todo trabalho novo segue **teste primeiro, código depois**, no padrão dos testes existentes (Vitest + Supertest, arquivos em `tests/integration/v1/` e `tests/unit/`). Ciclo de cada feature: escreve os testes do caso → roda e vê falhar → implementa o mínimo pra passar → refatora → commit. Nunca implemente uma feature sem teste que a guie.

**Hierarquia de branches (git-flow por fase):**
- **`main` é produção.** **NENHUM** commit é feito direto nela — nunca, em hipótese alguma, nem mesmo commit de documentação ou de planejamento. `main` só recebe merge vindo de `dev`. No futuro esse merge dispara **deploy automático**, então tratar `main` como intocável não é preciosismo: é o que impede um commit de doc de virar um deploy.
- **`dev` é a base de integração** e existe sempre. Toda branch de fase sai dela.
- Cada fase do roadmap (ver `docs/todo.md`) tem **uma branch de fase** criada a partir da `dev`, nomeada `fase-<n>` (ex.: `fase-4`). O commit de **planejamento** da fase (o passo-a-passo no `docs/todo.md`) é o primeiro commit dessa branch — nunca vai direto na `dev` nem na `main`.
- Cada feature da fase tem **sua própria branch** criada a partir da branch da fase, nomeada `feat/fase-<n>-<m>-<slug>` (ex.: `feat/fase-4-2-password-reset`). Ao terminar a feature (testes + `typecheck` + `lint` verdes), **mergeia de volta na branch da fase** (`--no-ff`) e apaga a branch da feature.
- Ao concluir a **fase inteira**, a branch da fase é mergeada na `dev` (`--no-ff`).
- Depois de a suíte completa passar na `dev`, ela é mergeada na `main` e **uma `dev` nova é aberta a partir da `main`**.
- Trabalho que não pertence a nenhuma fase (correção pontual, mudança de doc, ajuste de processo) também sai da `dev`, em branch própria com nome descritivo (ex.: `docs/branch-workflow`, `fix/<slug>`), e volta pra `dev` por merge `--no-ff`.

Resumo do fluxo: `dev` → `fase-<n>` → `feat/fase-<n>-<m>-<slug>` → merge na `fase-<n>` → (fim da fase) merge na `dev` → (suíte verde) merge na `main` + nova `dev`.

**A numeração de fase é global e nunca reinicia.** O roadmap é agrupado em **ciclos** (Ciclo 1 = fundação, Fases 1–8; Ciclo 2 = domínio pet shop, Fase 9 em diante), mas o ciclo é só agrupamento de leitura no `docs/todo.md`: a fase seguinte à 9 é a 10, não "Ciclo 2 fase 2". O `<n>` do nome da branch depende disso — dois "fase-1" em ciclos diferentes tornariam o histórico ambíguo.

## Commits em ingles

Mensagens de commit devem ser escritas em ingles. **Nunca assinar o commit**, apenas escrever as mensagens. 

---

## Stack

TypeScript (tsconfig strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) · Node/Express · Prisma 7 (driver adapter pg, output `src/generated/prisma`) · Zod 4 · Vitest+Supertest+Faker · Biome · JWT+bcrypt. Banco de teste na porta 5433.

## Arquitetura — camadas

Fluxo rígido: **route → controller (Zod parse) → service (regras de negócio) → repository (Prisma)**. Cada camada só fala com a adjacente. Repository é a ÚNICA que toca o Prisma. Controller só faz parse + chama service + responde. Service tem as regras e orquestra. Nunca pule camadas.

## Organização de módulos

Cada módulo em `src/modules/<nome>/` com: `*.route.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.schema.ts` (Zod), `*.presenter.ts` (views). Módulos: **user** (CRUD + perfis em subarquivos `user.profile.*`), **role** (read-only), **feature** (read-only), **permission** (overrides de feature), **auth** (login/sessão). Constantes de domínio (roles, features) em `*.constants.ts`, lidas pelo seed.

Padrões transversais: `lib/authorization.ts` (cômputo de features, `can`/`hasFeature`/`canActOnResource`), `utils/presenter.ts` (whitelist via Zod), error handler central, `errors/errorFactory.ts` (factories `create*`).

---

## Regras de negócio JÁ DECIDIDAS (siga, não re-decida)

**Modelo de usuário:** todo user tem ≥1 perfil (customer/employee, 1:1 por presença) e cada perfil tem ≥1 role. Perfil definido pela presença da relação, não por um campo "tipo".

**Autorização:** roles agregam features; `UserFeature` guarda só overrides (grant/deny), nunca cópias. **O override pendura na atribuição de role, não no usuário** (`UserFeature.userRoleId` → `UserRole`, Fase 8.0): override é sobre a função, então perder a role mata o ajuste fino dela. A identidade do recurso é a tripla `(user, role, feature)` e a role vai no path (`PUT|DELETE /users/:userId/roles/:roleId/features/:featureId`). `UserRole` tem `@@unique([userId, roleId])` — uma linha por par, para sempre, revivida na re-concessão. Features efetivas = `(⋃ roles ∪ grants) − denies`, computadas em runtime por `computeEffectiveFeatures` (função pura, dois laços: todas as estáticas antes de qualquer override). Wildcard `*` = admin pode tudo. Autorização SEMPRE antes da busca (403 vence 404).

**Roles read-only via API** (definidas em código, seed). Só o vínculo user↔role é gerenciável. `appliesTo` (EMPLOYEE/CUSTOMER/null) valida compatibilidade role↔perfil.

**Não-escalação:** conceder via override — ou atribuir uma role que contenha — uma feature de PRIVILEGED_FEATURES exige role **admin** (não só a feature). O conjunto é `PERMISSION_FEATURES` (read:feature, read:role, read:permission, manage:permission) **+ `read:audit-log:full`** (que destrava o IP inteiro no audit log; Fase 7.8). Definido em `role.constants.ts` (`PRIVILEGED_FEATURES`), checado no `permission.service` buscando a role do ator. `read:log`/`read:audit-log` são normais (concedíveis sem ser admin).

**Soft delete** (preserva histórico para auditoria): User, Customer, Employee, UserRole, UserFeature têm `deletedAt`. TODAS as queries de leitura filtram `deletedAt: null` — incluindo `getUserForFeatureComputation` (é o que mata o token de deletado e ignora overrides removidos). Hard delete só em teardown de teste e nos scripts de faxina (`src/scripts/cleanup-*`). UserFeature/UserRole usam `id` próprio como PK (não par composto); a unicidade é do **banco** (`@@unique`), não do código.

**Cascata e restauração (Fase 8):** deletar desce quatro níveis — `User` → perfis → `UserRole` → `UserFeature` —, com **um único `new Date()` por transação** propagado por toda a cadeia (`user.lifecycle.repository.ts`). Nunca existe filho ativo de pai morto. Restaurar sobe só **dois** (`User` → perfil → `UserRole`): o perfil volta porque foi **nomeado**, as roles dele voltam por **correlação de `deletedAt`** com o do perfil, e **nenhum override ressuscita por efeito colateral** — só por `PUT` explícito na tripla. A assimetria é principiada: deletar demais é fail-closed, restaurar demais é vazamento de privilégio. Racional em `docs/adr/authorization-scope-and-lifecycle.md`. Conta deletada tem caminho de volta (reativação por signup ou por admin, sempre confirmada pelo dono via token); **nunca** existe usuário ativo sem ao menos um perfil ativo.

**Validação:** sintática (Zod, sem banco) no controller; semântica (precisa de banco — appliesTo, etc.) no service. Ambas produzem 422 no mesmo shape (`errors` por campo). Unicidade pelo banco (P2002 → 409 no handler, lê `meta.driverAdapterError.cause.constraint.fields`).

**Erros:** factories `create*` retornam instâncias de subclasses de `AppError`; o caller dá `throw`. 422 VALIDATION_ERROR, 409 CONFLICT, 404 NOT_FOUND, 403 FORBIDDEN (action nomeia a feature), 401 UNAUTHORIZED.

**Tipos:** `FeatureName`/`RoleName` (union literal) onde se DIGITA o literal no código; `string` onde o dado vem do banco. A fronteira é banco/request — forçar o union além dela gera `as` (evite).

**Domínio pet shop (a partir da Fase 9):** `Product` é identidade comercial, `ProductVariant` é a unidade vendável (SKU/preço/estoque) — todo produto tem ≥1 variante, nunca produto plano. Espécie de pet (`PetSpecies`) é **faceta** do produto (`targetSpecies[]`), nunca nível da árvore de `Category` — categoria modela função, não espécie. Racional completo em `docs/adr/pet-domain-modeling.md` e `docs/adr/product-catalog-modeling.md`.

---

## Convenções de código

- Presenter (view Zod) por whitelist: `.parse()` derruba campos não listados → nada sensível vaza. View resolvida pela capability do viewer.
- Junção do Prisma sempre aninha (`user.roles` = `UserRole[]` com `.role` dentro); achate no service ou espelhe na view.
- `snake_case` no banco via `@map`; camelCase no código.
- Valores monetários em inteiro-**centavos** (`priceCents`, nunca `Decimal`/float); peso em inteiro-**gramas** (`weightGrams`). Mesmo racional dos dois: aritmética inteira, sem bug de ponto flutuante, sem `Decimal` do Prisma contaminando serialização/Zod.
- SQL cru (necessário só para busca textual com `tsvector`/`pg_trgm`, Fase 9) vive **exclusivamente no repository**, via `$queryRaw` com template parametrizado — nunca concatenação, nunca fora dessa camada. Ver `docs/adr/text-search.md`.

## Comandos

- Ambientes via Compose base + overrides (arquivos em `infra/`, junto dos entrypoints; o `Dockerfile` fica na raiz porque é a raiz do contexto de build), isolados por `-p pet-oasis-{dev,test,prod}`; env por arquivo (`.env.development`/`.env.test`/`.env.production`, na raiz, fora do git; `.env.example` versionado). Racional em `docs/adr/environments-and-deploy.md`.
- Dev: `npm run dev` (Compose em foreground: db + mailpit + app-em-container via tsx watch; Ctrl+C = SIGTERM gracioso) · `dev:down` · `dev:reset` · `dev:mail` · `dev:db` (só o Postgres-de-dev, detached e healthy — é o pré-requisito dos `db:*` quando não se quer a stack em foreground).
- Teste: `npm test` (sobe o Postgres-de-test isolado, roda o Vitest no host e **sempre** derruba ao final, inclusive em falha) · `test:coverage` · `test:watch` · helpers `test:services:up`/`down`. Testar 1 arquivo (com o test-db de pé): `npx vitest run <nome>` · watch: `npx vitest <nome>` · 1 caso: `-t "nome"`.
- Produção: `npm run prod:up` (build + só app + Postgres-de-prod, `migrate deploy` no entrypoint) · `prod:down` · `prod:logs`.
- Migration dev (autoria consciente): `npm run db:migrate` (roda com `.env.development`, já gera o client) · `db:generate` · `db:seed` · `db:studio`.
- Typecheck: `npm run typecheck` · Lint: `npm run lint` · Lint com fix: `npm run lint:fix` · Format: `npm run format`

## ⚠️ REGRA — Prefira os scripts do `package.json` a comandos diretos

Antes de rodar um comando pra fazer algo que o projeto já tem um script pronto (typecheck, lint, migration, teste, seed, etc.), **use o script** (`npm run <nome>`), não a ferramenta direta (`tsc --noEmit`, `prisma migrate dev`, `biome check .`, etc.). Os scripts existem pra manter o projeto consistente (flags certas, `DATABASE_URL` certa, etc.) — rodar a ferramenta crua por fora pode divergir sutilmente do que o script faz. Ex.: gerar uma migration deve ser `npm run db:migrate`, não `prisma migrate dev` direto no terminal.

Ao final de qualquer trabalho ou antes de commitar, rode `npm run typecheck` e `npm run lint` (ou `lint:fix` se houver algo auto-corrigível) e confirme que ambos passam limpos — igual já se faz com a suíte de testes.

Se perceber a necessidade de um script que não existe — algo que você (ou o padrão do projeto) vai repetir com frequência — **pare e sugira criar o script no `package.json`** em vez de só rodar o comando direto. Para algo pontual, que não vai se repetir, tudo bem rodar direto no terminal sem propor script novo.

---

## TODO e roadmap

O estado atual, a ordem das tarefas e o que vem a seguir vivem em **`docs/todo.md`** e no documento de contexto `docs/context.md`. Consulte-o antes de começar qualquer tarefa para saber o próximo item e o que já está feito. Mantenha-o atualizado conforme concluir tarefas.

**Forma de registro no `docs/todo.md`:** a fase **em execução** fica expandida (passo-a-passo, decisões de kickoff, pendências `🔸`); a fase **fechada** é destilada num resumo de poucos bullets. Ao fechar uma fase, essa destilação faz parte do trabalho de fecho: o *porquê* e os gotchas migram para `docs/context.md` (ou o ADR correspondente) **antes** de o expandido ser removido — nunca apague detalhe que só existe ali. O detalhe de execução permanece recuperável no histórico do git.

## ⚠️ REGRA — Anotação de pendência vai no LOCAL DA EXECUÇÃO, nunca para trás

Quando terminar um trabalho e sobrar algo pendente para uma etapa/sessão **futura**, a anotação (`🔸 Pendente...`, `Nota p/ ...`, TODO) deve ficar **onde a pendência vai ser executada** — na seção da sessão/sub-fase futura que vai resolvê-la —, **nunca** ao fim da seção que você acabou de fechar. Anotar para trás (na etapa já concluída) garante que, ao chegar na etapa futura, ninguém lê a nota e a pendência se perde. Regra prática: antes de escrever "fica para a Sessão X", vá até a seção da Sessão X no `docs/todo.md` e escreva a nota **lá**. Se a seção futura ainda não existe, crie o placeholder dela.

## O que o projeto planeja ser

O **Ciclo 1 (fundação) está fechado**: autenticação com refresh rotativo, autorização RBAC com overrides escopados, usuários e perfis, verificação de email e status de conta, hardening (rate limit, lockout, observabilidade) e o ciclo de vida completo de deleção/reativação.

O **Ciclo 2 abre o domínio do pet shop**: a Fase 9 traz pets (ligados a `Customer`) e catálogo (produto/variante, marca, categoria, tag, busca textual, upload de imagem), ainda **sem checkout**; a Fase 10 traz carrinho, pedido e pagamento — o que dá sentido pleno ao soft delete já existente (histórico de venda íntegro).

---

## Estilo de colaboração

Fecha um assunto antes de abrir outro (um loop por vez; não introduza tópicos novos no meio). Explique o "porquê", não só o "o quê". Seja direto sobre problemas, mantendo a decisão final com o usuário.
