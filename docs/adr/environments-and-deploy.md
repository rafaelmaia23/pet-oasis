# Ambientes (dev/test/prod), Docker por ambiente e deploy

> Decisão de infraestrutura registrada na Fase 6. Não altera regra de negócio.
> Nasceu de dois bugs de deploy e de um débito estrutural (env único, sem
> separação de ambientes, sem graceful shutdown).

## O problema

1. **Produção nunca falava com a Resend.** O `docker-compose.yml` único hardcodava
   `SMTP_HOST: mailpit` / `SMTP_PORT: 1025` no serviço `app` e não repassava
   `SMTP_USER`/`SMTP_PASS`. Independente do `.env`, o container sempre mirava o
   mail-catcher de dev.
2. **Produção subia coisas de dev.** O bring-up "full" subia o Compose inteiro;
   `db_test` e `mailpit` não tinham profile, então sempre subiam.
3. **Débito estrutural.** Um `.env` só (via `dotenv/config`), a URL do banco de
   teste duplicada em 4 lugares, nenhuma separação limpa dev/test/prod. O app não
   tratava `SIGTERM` (o `http.Server` nem era capturado).

## Decisão ✅

### Compose base + overrides por ambiente
`docker-compose.yml` (base, só o esqueleto do `app`) + `docker-compose.dev.yml`
/ `docker-compose.prod.yml` / `docker-compose.test.yml`. Mailpit e Postgres-de-dev
existem só no override de dev; **produção sobe apenas `app` + Postgres-de-prod**;
teste sobe só Postgres-de-test (mailpit-de-test atrás de `--profile mail`, inerte
hoje porque os testes mockam `@/lib/email`). Isolamento por **nome de projeto**
(`-p pet-oasis-{dev,test,prod}`) + `container_name`/volumes/portas distintos → dev
e test rodam simultâneos. O SMTP do app agora vem inteiro do `env_file` (mata o
bug 1); um bring-up de prod não instancia db-de-dev/test nem mailpit (mata o bug 2).

### Envs por ambiente + carregamento
`.env.development`, `.env.test`, `.env.production` (todos fora do git) +
`.env.example` versionado. Containers recebem o env via **`env_file:`** do Compose.
Tooling do **host**: o runner do Vitest é auto-suficiente (o `vitest.config.ts`
carrega `.env.test` com `override:true`, então `npx vitest run <arquivo>` funciona
sozinho); a autoria de migration usa **`dotenv-cli`** (`dotenv -e .env.development
-- prisma …`). A URL do banco de teste, antes duplicada em 4 lugares, vive só no
`.env.test`. `src/config/env.ts` e `prisma.config.ts` ficam intocados — o
`import "dotenv/config"` vira no-op sem `.env` na raiz.

### Boot determinístico
Dev/test/prod usam **`prisma migrate deploy`** no boot (nunca `migrate dev`). A
autoria de migration nova (`npm run db:migrate` = `migrate dev`) é um comando
consciente, à parte. O seed de referência (features/roles) roda em todo ambiente;
o **usuário demo** só quando `SEED_DEMO_USER=true` (ligado em prod/demo).

### Graceful shutdown nativo do Compose
Orquestração por healthchecks + `depends_on: { condition: service_healthy }` +
`--wait` (prod/test); dev roda em **foreground** (incompatível com `--wait`),
Ctrl+C → SIGTERM gracioso. O app trata SIGTERM/SIGINT via
`createShutdownHandler` (`src/lib/shutdown.ts`): `server.close()` (drena
in-flight) → `prisma.$disconnect()` → exit, com timeout de força-saída (10s <
`stop_grace_period` de 15s do prod). O entrypoint faz `exec` do Node/tsx para ele
ser **PID 1** e receber o sinal.

### Dockerfile
Stages `build` → `runtime` (prod, intocado: bundle tsup, `npm prune --omit=dev`,
`USER node`) + novo stage **`dev`** (para no `npm ci` completo, sem bundle/prune,
roda `tsx watch` contra `src/` por bind-mount; fica root para evitar EACCES de
uid). O client Prisma gerado no dev vive num **volume anônimo** em
`/app/src/generated` (senão o bind-mount de `./src` o mascararia); o entrypoint de
dev roda `prisma generate` no start para populá-lo. `build.network: host`
preservado (Tailscale MagicDNS) e `npm ci` único (memória do VPS ARM64).

## Alternativas consideradas

- **Loader ciente de `NODE_ENV`** em `env.ts` (em vez de dotenv-cli): frágil na
  ordem de carga (filhos `execSync` do globalSetup não herdam o `NODE_ENV`
  setado in-process) e duplica lógica em dois arquivos. Preterido.
- **Mover o output do Prisma para fora de `src/`** (em vez do volume anônimo):
  forçaria churn em todos os imports `@/generated`. Preterido.
- **Script Node com `spawn`** para orquestrar shutdown: é justamente o que causava
  shutdown brusco no Ctrl+C num projeto anterior. Preterido em favor do Compose
  nativo.

## Achado colateral — `clearDatabase`

Investigado por suspeita de que o `clearDatabase` (afterEach) apagaria o seed de
referência. **Não é bug:** ele só apaga tabelas transacionais
(user/session/token/perfis); `Feature`/`Role`/`RoleFeature` são semeadas uma vez
no `globalSetup` e preservadas entre os testes — que é o que as factories
(`buildEmployee`/`buildCustomer`, que ligam por nome) precisam. Adicionado um
**teste-guarda** (`clearDatabase.guard.test.ts`) que trava contra uma regressão
futura, e um comentário no próprio helper.

## Quando revisitar

- Ao encaixar **Redis** (Fase 7): novo serviço nos overrides + `REDIS_URL` no env.
  A estrutura base+overrides já comporta sem retrabalho.
- Ao **automatizar o deploy**: `prod:up` já é idempotente (`migrate deploy` no
  entrypoint); falta só o gatilho externo (CI/registry).
- Se o `--wait` de prod precisar esperar o app *servir* (não só *subir*): adicionar
  um healthcheck HTTP ao serviço `app` de prod (hoje sem, para manter o runtime
  intocado).
