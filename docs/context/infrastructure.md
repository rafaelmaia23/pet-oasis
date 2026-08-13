# Infraestrutura — ambientes, deploy, documentação da API e seeds

> Nenhuma regra de negócio vive aqui: é empacotamento, ambiente e dado de demonstração. O ADR
> [`environments-and-deploy.md`](../adr/environments-and-deploy.md) detalha a estrutura de
> Compose; o procedimento operacional está em [`guides/deploy.md`](../guides/deploy.md).

---

## Ambientes

### Os dois bugs que motivaram a reformulação (Fase 6)

1. O app **nunca falava com a Resend** — o compose único hardcodava `SMTP_HOST: mailpit` /
   `SMTP_PORT: 1025` no serviço `app` e não repassava `SMTP_USER`/`SMTP_PASS`.
2. Um bring-up de "produção" subia `db_test` e `mailpit` (sem profile, sempre ligados).

### Compose base + overrides

Um `docker-compose.yml` base (só o esqueleto do `app`) + `docker-compose.{dev,prod,test}.yml`.
Mailpit e Postgres-de-dev existem só no override de dev; **prod sobe só `app` + Postgres-de-prod**;
test sobe só Postgres-de-test (mailpit-de-test atrás de `--profile mail`, inerte porque os testes
mockam `@/lib/email`). Isolamento por **nome de projeto** (`-p pet-oasis-{dev,test,prod}`) +
`container_name`/volumes/portas distintos → dev e test rodam juntos. O SMTP do app passa a vir
inteiro do `env_file` (mata o bug 1); prod não instancia infra de dev/test (mata o bug 2). O
app-em-dev também passou a rodar **em container** (via `tsx watch` lendo `src/` por bind-mount),
não mais no host.

Isso **superou o desenho anterior** (Fase 5), em que o serviço `app` ficava atrás de um profile
`full` e derivava a própria `DATABASE_URL` (`@db:5432`) porque o app rodava no host: o profile
existia para que `docker compose up -d` não subisse um app-em-container brigando pela porta, e a
`DATABASE_URL` própria existia porque o app-em-container alcança o Postgres pelo **nome do
serviço**, não por `localhost`. Com um override por ambiente, os dois artifícios deixaram de ser
necessários.

### Envs por arquivo + dotenv-cli

`.env.development`/`.env.test`/`.env.production` (fora do git) + `.env.example` versionado — colapsa
cinco fontes numa por ambiente. Containers recebem via `env_file:`. No host, o `vitest.config.ts`
carrega `.env.test` (`override: true`), então `npx vitest run <arquivo>` funciona sozinho, e a
autoria de migration usa `dotenv-cli` (`dotenv -e .env.development -- prisma …`). A URL do banco de
teste, antes duplicada em quatro lugares, vive só no `.env.test`. `src/config/env.ts` e
`prisma.config.ts` ficam intocados (o `import "dotenv/config"` vira no-op sem `.env` na raiz).

### Graceful shutdown nativo do Compose, não script com `spawn`

Healthchecks + `depends_on: service_healthy` + `--wait` (prod/test); dev em **foreground**
(incompatível com `--wait`), Ctrl+C → SIGTERM gracioso. O app trata SIGTERM/SIGINT via
`createShutdownHandler` (`src/lib/shutdown.ts`, injeção de dependência → testável):
`server.close()` (drena in-flight) → `prisma.$disconnect()` → exit, com timeout de força-saída (10s
< `stop_grace_period` de 15s do prod). O entrypoint faz `exec` do Node/tsx para ele ser **PID 1** e
receber o sinal.

### O client Prisma do dev num volume anônimo

O generator escreve em `src/generated`, que o bind-mount de `./src` mascararia; um volume anônimo em
`/app/src/generated` preserva o client gerado no container (o entrypoint de dev roda `prisma
generate` no start). Evita churn nos imports `@/generated`. O stage `dev` do Dockerfile para no `npm
ci` completo (sem bundle/prune) e fica root, evitando EACCES de uid no bind-mount; o `runtime` de
prod segue intocado.

---

## Imagem e boot de produção

### `migrate deploy`, nunca `migrate dev`

`migrate dev` é interativo, pode gerar/aplicar migrations novas e **resetar o banco** em caso de
drift — inaceitável num servidor. `migrate deploy` só aplica as migrations já versionadas, de forma
idempotente e não-interativa. O entrypoint faz `migrate deploy → seed → start`: a subida deixa um
ambiente do zero funcionando. O seed é idempotente (upserts), então rodar a cada start é seguro.

### O seed é bundlado pelo tsup (`dist/seed.js`)

`prisma db seed` invoca `tsx prisma/seed.ts`, que importa de `src/` — nada disso existe na imagem de
produção (só `dist/` + node_modules de prod, sem `tsx` nem código-fonte). Adicionar `prisma/seed.ts`
como 2ª entry do tsup produz um `dist/seed.js` auto-contido (o client Prisma gerado é embutido no
bundle; o wasm do query-compiler vem de `@prisma/client` em runtime), que o entrypoint roda com
`node dist/seed.js`. O fluxo de dev segue usando `prisma db seed` (tsx) inalterado.

### Imagem multi-stage e não-root

O build (deps completas, `prisma generate`, `tsup`) é pesado e não precisa ir para produção: um
stage `deps` isola as dependências de produção, o stage `build` gera o `dist/`, e o `runtime` copia
só `node_modules` de prod + `dist/` + schema/migrations (para o `migrate deploy`). Roda como `USER
node` — higiene básica de container.

---

## Documentação da API

### Gerada dos próprios schemas Zod, não escrita à mão

O contrato já vive nos `*.schema.ts` (request) e `*.presenter.ts` (response). Escrever um OpenAPI
paralelo à mão criaria duas fontes que divergem no primeiro refactor. Com o
`.meta({ description, example })` **nativo do Zod 4** (sem monkey-patch, sem `zod-to-openapi`
patchando o protótipo), cada schema carrega a própria doc e o `createDocument` (`zod-openapi`) monta
o `/openapi.json`. O envelope `{ body, params, query }` que os controllers já usam é extraído por
`.shape.*` num helper (`fromEnvelope`), com guarda de presença.

### Os presenters garantem que a doc não vaza segredo

As views já derrubam campos não listados via `.parse()` (`passwordHash`, `tokenHash`,
`refreshTokenHash` nunca entram na resposta). Como os exemplos de response no OpenAPI saem **das
mesmas views**, o documento herda a garantia — verificado por teste (`openapi.test.ts`: a spec não
contém nenhum desses campos). Documentar a partir da whitelist é mais seguro que anotar exemplos à
mão, que poderiam reintroduzir um campo sensível por descuido.

### `/openapi.json` e `/reference` são públicas, no router de topo

Documentação de API é para ser lida sem credencial; travá-la atrás de `authenticate` só atrapalharia.
Ficam no router de topo, antes dos grupos protegidos, fora de `/api/v1`. A UI Scalar consome o
`/openapi.json` e tem "try it" com Bearer preenchível — daí o `securitySchemes.bearerAuth` global no
documento, com as operações públicas sobrescrevendo `security: []`. O hardening da CSP dessa página
está em [security.md](security.md#auto-hospedar-o-bundle-do-scalar-em-vez-de-allowlistar-o-cdn).

### O token da coleção Bruno usa `bru.setVar`, não `setEnvVar`

O `script:post-response` do request `Login` encadeia o access token nas demais requests.
`setEnvVar` grava no arquivo do environment, que é **versionado** — o token do usuário demo acabaria
commitado em `api-collection/`. `bru.setVar` guarda em memória, só durante a execução (também o
caminho preferido no Bruno v4, que está descontinuando `setEnvVar` para esse uso).

---

## Seeds e ambiente demo

### Role `demo` sempre semeada, usuário demo atrás de flag

O objetivo é deixar qualquer visitante exercitar o RBAC ao vivo (todo `GET` → 200, toda escrita →
403) sem sujar ou quebrar dados. A role `demo` (`appliesTo EMPLOYEE`, só features de leitura) faz
parte do catálogo e é sempre semeada. Já o **usuário** só nasce com `SEED_DEMO_USER=true` (ligado no
Docker/prod, desligado em dev/test para não sujar a suíte). Assim o mesmo seed serve os três
ambientes sem ramificar além desse flag. As credenciais são públicas de propósito
(`env.DEMO_EMAIL`/`DEMO_PASSWORD`), e o seed limpa `bannedAt`/`bannedBy`/`banReason` no update — um
redeploy sempre restaura o demo utilizável.

### Reset do demo é truncate+reseed, e a guarda é flag explícita

"Deletar o que não é seed" exigiria um marcador em toda tabela e cresceria a cada model novo da Fase
9; truncate+reseed é determinístico e não cresce. A guarda é `DEMO_MODE=true` — **não** `NODE_ENV`,
porque o deploy demo *é* production, e inferir apagaria o banco de produção de verdade caso o projeto
ganhe um. Sem a flag: erro barulhento, exit ≠ 0, nada apagado. O reset é **diário** (não a cada 3
dias) para ninguém encontrar a bagunça do visitante anterior, com o horário publicado na doc — o que
transforma um logout inesperado em comportamento documentado.

O reset é **higiene**, não o que garante o demo read-only — isso é RBAC (role `demo`). São duas
defesas independentes.

### Gotcha do reseed compartilhado (7.14)

O seed foi extraído para `src/lib/seedDatabase.ts` (`runSeed`, **sem nenhum código auto-executável
no nível do módulo**) e é reusado por `prisma/seed.ts` (CLI) e por `demo-reset.ts`. A primeira
tentativa importava `runSeed` direto de `prisma/seed.ts`, que tinha um `main()` guardado por
`import.meta.url === argv[1]`: o guard funciona em dev, mas o tsup bundla os dois scripts num módulo
só, então **ambos os guards passaram a comparar contra o mesmo** `import.meta.url`/`argv[1]` e
disparavam juntos — rodar `demo-reset.js` executava (e desconectava) o `main()` do seed por baixo. A
lição vale para qualquer script novo: código reaproveitado entre entrypoints não pode carregar
auto-execução.

### `demo-reset` esquecia a tabela `previousEmail`

Ele truncava 8 tabelas na mesma ordem FK-safe de `clearDatabase()`, mas a `previousEmail` nasceu na
7.15, depois de a 7.14 ter sido escrita, e ninguém voltou para atualizar a lista. Na época, um email
trocado via `change-email` no demo ficaria **preso para sempre** mesmo após o reset diário, porque a
coluna era unique global. Esse efeito deixou de existir na 8.6 (o `@unique` saiu e `PreviousEmail`
parou de bloquear — ver
[identity-and-sessions.md](identity-and-sessions.md#o-unique-de-previousemailemail-saiu-junto-k25)),
mas o fix continua certo pelo motivo geral: a tabela é transacional e tem de voltar ao estado
inicial.

---

## Dataset fake

### Duas flags independentes: `SEED_FAKE_DATA` e `SEED_ADMIN_USER`

O dataset fake (customers/employees/híbridos) é seguro no demo público — mesmo com escrita
disponível via roles `manager`, o dano fica contido ao próprio dataset e o `demo-reset` diário
restaura. Já o usuário admin de teste tem acesso total (`*`): diferente do demo (só leitura, com
credencial pública assumida como risco baixo), uma conta de escrita irrestrita exposta na internet é
superfície de ataque real, mesmo com os dados voltando todo dia. Separar as flags permite ligar o
dataset fake em produção/demo sem nunca ligar o admin lá — `SEED_ADMIN_USER` só existe em
`.env.development`.

### O dataset inclui roles com escrita (`manager`), com o risco assumido

Sinalizado explicitamente antes de implementar (mesmo racional de "credencial pública, risco baixo,
dado sempre restaurável" do `DEMO_PASSWORD`): sem isso o dataset não demonstraria as features de
gestão de usuário (ban, force-password-reset, permission override) na prática. Aceito
conscientemente, não por omissão.

### A idempotência depende só do email fixo

A primeira versão do design cogitava semear nome/cpf/telefone com um `faker.seed()` fixo para o
dataset ser idêntico a cada reseed. Na implementação ficou claro que não é necessário: a checagem é
"existe um user com este email? se sim, pula" — uma vez criado, reruns nunca voltam a tocar
CPF/nome/telefone daquele registro. `cpf-cnpj-validator` (`cpf.generate()`) também não é
determinístico via seed do Faker (usa `Math.random` internamente), então perseguir determinismo total
exigiria mais uma dependência sem comprar nada: ninguém depende do CPF exato de um usuário fake.
Nome/telefone ainda usam seed fixo — estética, não a garantia de idempotência.

### Instância própria de Faker, não o singleton dos testes

`@faker-js/faker` exporta um singleton compartilhado; chamar `.seed()` nele mudaria o stream de
valores consumido por qualquer teste que rode no mesmo processo depois de o módulo de seed ser
importado — flakiness sutil dependente de ordem de import. `new Faker({ locale: [en] })` isola
completamente os dois geradores.

### Criado via `userRepository`, não via `user.service`

`user.service.createCustomer`/`createEmployee` dispara `issueEmailVerification` (email real, via
SMTP). Rodando o seed a cada boot do container, isso bombardearia o relay de emails de verificação
inúteis a cada restart. O repository (mesma técnica de `tests/factories/user.factory.ts`) cria sem o
efeito colateral, e o `status` é forçado por `prisma.user.update` depois — idêntico ao que os testes
já faziam.

---

## Achado de teste

### `clearDatabase` não era bug

Ele só apaga tabelas transacionais; `Feature`/`Role`/`RoleFeature` (seed do `globalSetup`) já eram
preservadas entre testes — que é o que as factories precisam. Ganhou teste-guarda
(`clearDatabase.guard.test.ts`) contra regressão futura.
