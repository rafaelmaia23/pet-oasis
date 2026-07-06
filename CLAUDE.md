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

## ⚠️ REGRA — TDD sempre com feat por Branch

Todo trabalho novo segue **teste primeiro, código depois em Branch separada por feat**, no padrão dos testes existentes (Vitest + Supertest, arquivos em `src/__tests__/integration/v1/` e `src/__tests__/unit/`). Fluxo: cria uma Branch com o nome da feat → escreve os testes do caso → roda e vê falhar → implementa o mínimo pra passar → refatora → commit → PR. Nunca implemente uma feature sem teste que a guie. Nunca implemente uma feature na Branch Main.

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

**Autorização:** roles agregam features; `UserFeature` guarda só overrides (grant/deny), nunca cópias. Features efetivas = `(⋃ roles ∪ grants) − denies`, computadas em runtime por `computeEffectiveFeatures` (função pura). Wildcard `*` = admin pode tudo. Autorização SEMPRE antes da busca (403 vence 404).

**Roles read-only via API** (definidas em código, seed). Só o vínculo user↔role é gerenciável. `appliesTo` (EMPLOYEE/CUSTOMER/null) valida compatibilidade role↔perfil.

**Não-escalação:** mexer em PERMISSION_FEATURES (read:feature, read:role, read:permission, manage:permission) via override exige role **admin** (não só a feature). Checado no service buscando a role do ator.

**Soft delete** (preserva histórico para auditoria): User, Customer, Employee, UserRole, UserFeature têm `deletedAt`. Sem reativação no ciclo 1 (email/cpf/perfil de deletado ficam "presos"; recovery é futuro). TODAS as queries de leitura filtram `deletedAt: null` — incluindo `getUserForFeatureComputation` (é o que mata o token de deletado e ignora overrides removidos). Hard delete só em teardown de teste. UserFeature/UserRole usam `id` próprio como PK (não par composto) + unicidade do ativo controlada por código (busca ativo → update ou create).

**Validação:** sintática (Zod, sem banco) no controller; semântica (precisa de banco — appliesTo, etc.) no service. Ambas produzem 422 no mesmo shape (`errors` por campo). Unicidade pelo banco (P2002 → 409 no handler, lê `meta.driverAdapterError.cause.constraint.fields`).

**Erros:** factories `create*` retornam instâncias de subclasses de `AppError`; o caller dá `throw`. 422 VALIDATION_ERROR, 409 CONFLICT, 404 NOT_FOUND, 403 FORBIDDEN (action nomeia a feature), 401 UNAUTHORIZED.

**Tipos:** `FeatureName`/`RoleName` (union literal) onde se DIGITA o literal no código; `string` onde o dado vem do banco. A fronteira é banco/request — forçar o union além dela gera `as` (evite).

---

## Convenções de código

- Presenter (view Zod) por whitelist: `.parse()` derruba campos não listados → nada sensível vaza. View resolvida pela capability do viewer.
- Junção do Prisma sempre aninha (`user.roles` = `UserRole[]` com `.role` dentro); achate no service ou espelhe na view.
- `snake_case` no banco via `@map`; camelCase no código.

## Comandos

- Testar 1 arquivo: `npx vitest run <nome>` · watch: `npx vitest <nome>` · 1 caso: `-t "nome"`
- Migration dev: `npm run db:migrate` (já gera o client) · reset: `npm run db:reset` + `db:seed`
- Banco de teste: `db:test:up` / `db:test:migrate`
- Typecheck: `npm run typecheck` · Lint: `npm run lint` · Lint com fix: `npm run lint:fix` · Format: `npm run format`

## ⚠️ REGRA — Prefira os scripts do `package.json` a comandos diretos

Antes de rodar um comando pra fazer algo que o projeto já tem um script pronto (typecheck, lint, migration, teste, seed, etc.), **use o script** (`npm run <nome>`), não a ferramenta direta (`tsc --noEmit`, `prisma migrate dev`, `biome check .`, etc.). Os scripts existem pra manter o projeto consistente (flags certas, `DATABASE_URL` certa, etc.) — rodar a ferramenta crua por fora pode divergir sutilmente do que o script faz. Ex.: gerar uma migration deve ser `npm run db:migrate`, não `prisma migrate dev` direto no terminal.

Ao final de qualquer trabalho ou antes de commitar, rode `npm run typecheck` e `npm run lint` (ou `lint:fix` se houver algo auto-corrigível) e confirme que ambos passam limpos — igual já se faz com a suíte de testes.

Se perceber a necessidade de um script que não existe — algo que você (ou o padrão do projeto) vai repetir com frequência — **pare e sugira criar o script no `package.json`** em vez de só rodar o comando direto. Para algo pontual, que não vai se repetir, tudo bem rodar direto no terminal sem propor script novo.

---

## TODO e roadmap

O estado atual, a ordem das tarefas e o que vem a seguir vivem em **`TODO.md`** e no documento de contexto CONTEXT.md. Consulte-o antes de começar qualquer tarefa para saber o próximo item e o que já está feito. Mantenha-o atualizado conforme concluir tarefas.

## O que o projeto planeja ser

Ciclo 1 foca na fundação: autenticação, autorização (RBAC com overrides), usuários e perfis. Fases seguintes: auth robusto (refresh token rotativo), verificação de email + status de conta, rate limiting/lockout, e o domínio do pet shop em si (Pets ligados a Customers, e adiante vendas/pedidos — que é o que dá sentido ao soft delete atual).

---

## Estilo de colaboração

Fecha um assunto antes de abrir outro (um loop por vez; não introduza tópicos novos no meio). Explique o "porquê", não só o "o quê". Seja direto sobre problemas, mantendo a decisão final com o usuário.
