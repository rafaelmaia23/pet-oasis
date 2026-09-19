# 03: Seed deixa de ser fatal no boot

**What to build:** uma falha ao semear dado de demonstração vira uma linha de log, não a API
inteira fora do ar. Hoje o entrypoint trata falha de seed como fatal: um erro de permissão ao
gravar imagem de catálogo pôs o container em crash loop e a API inteira em 502 no proxy — por
causa de dado de demonstração. Contraria a degradação fail-open já adotada para os destinos
externos de observabilidade.

**Blocked by:** 01 (sequenciamento: edita o mesmo bloco de serviço).

**Status:** fechada em 2026-09-06

- [x] O seed sai do caminho crítico do boot — passo one-shot, ou serviço dedicado que não
      reinicia.
- [x] Se permanecer no entrypoint, é fail-open: loga em nível de erro e segue para o start do
      servidor.
- [x] O servidor sobe e responde mesmo com o seed falhando.
- [x] O guia de deploy descreve como rodar o seed quando ele deixa de ser automático.
- [x] **Verificação manual:** provocar a falha (permissão negada no diretório de upload) e
      provar que a API sobe e responde.

> **Decisão do usuário (2026-09-06):** das duas alternativas do primeiro item, a escolhida foi
> **permanecer no entrypoint em fail-open** — mas não em bloco. A fronteira é por classe de dado:
> **referência** (features, roles, raças, léxico da busca) continua **fatal**, porque é
> pré-requisito da API como a migration; **demonstração** (usuário demo, admin de teste, dataset
> fake, tudo atrás de flag de env) é fail-open. Fail-open no seed inteiro deixaria a API de pé com
> a tabela de autorização quebrada, com o sinal escondido numa linha de log em vez de num crash
> loop. O mesmo tratamento vale para os dois entrypoints (prod e dev), sem divergência a manter.
>
> O fail-open não é silencioso: o passo falho entra em `failedOptionalSteps` no `SeedResult` e a
> última linha do seed vira `SEEDING COMPLETED WITH FAILURES: <passos>`. Racional permanente em
> [`apps/api/docs/adr/README.md#infraestrutura`](../../../apps/api/docs/adr/README.md#infraestrutura).
>
> **Teste automatizado, ao contrário do que a spec previa:** a fronteira saiu em TypeScript
> (`src/lib/seed/optionalSeedStep.ts`), não no Docker, então ela é testável sem falsificar nada —
> `tests/unit/lib/seed/optionalSeedStep.test.ts` afirma que o passo que falha vira log de erro
> nomeando o passo e não interrompe o seguinte. O que continua sendo só verificação manual é o
> boot dentro do container.

> Verificação manual **feita em 2026-09-06**, com os dois lados da fronteira. Banco descartável
> (`seedcheck`) para forçar o seed a criar tudo do zero, e o diretório de upload montado
> **read-only** para reproduzir a falha de permissão que originou a issue:

```sh
docker exec pet-oasis-dev-db psql -U postgres -c 'CREATE DATABASE seedcheck'
# override de teste: DATABASE_URL para o banco novo, SEED_FAKE_DATA=true e
#   - <dir vazio no host>:/app/uploads:ro
docker compose -p pet-oasis-dev --env-file .env.development \
  -f infra/docker-compose.yml -f infra/docker-compose.dev.yml -f <override>.yml \
  up -d --build api
curl -sSo /dev/null -w '%{http_code}\n' http://localhost:3000/openapi.json
```

Resultado: o seed logou `ERROR ... optional seed step failed` com `step: "fake-users-and-pets"` e
`step: "fake-catalog"` (`EROFS`/`mkdir '/app/uploads/brands'`), fechou com `SEEDING COMPLETED WITH
FAILURES: fake-users-and-pets, fake-catalog`, e o servidor subiu: **200** no `/openapi.json` e
`RestartCount` **0** — nenhum crash loop. As features, roles, raças e o usuário demo entraram
normalmente.

O outro lado, para provar que a fronteira não é fail-open disfarçado de tudo: o mesmo seed contra
um banco **sem as migrations aplicadas** (falha no dado de referência) sai com **código 1** — o
que, sob o `set -e` do entrypoint, é o boot parando como deve.
