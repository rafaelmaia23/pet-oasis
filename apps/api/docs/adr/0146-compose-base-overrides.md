# Compose base + overrides

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Ambientes*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Um `docker-compose.yml` base (só o esqueleto do `api`) + `docker-compose.{dev,prod,test}.yml`.
Mailpit e Postgres-de-dev existem só no override de dev; **prod sobe só `api` + Postgres-de-prod**;
test sobe só Postgres-de-test (mailpit-de-test atrás de `--profile mail`, inerte porque os testes
mockam `@/lib/email`). Isolamento por **nome de projeto** (`-p pet-oasis-{dev,test,prod}`) +
`container_name`/volumes/portas distintos → dev e test rodam juntos. O SMTP do app passa a vir
inteiro do `env_file` (mata o bug 1); prod não instancia infra de dev/test (mata o bug 2). O
app-em-dev também passou a rodar **em container** (via `tsx watch` lendo `src/` por bind-mount),
não mais no host.

Isso **superou o desenho anterior** (Fase 5), em que o serviço (então chamado `app`) ficava
atrás de um profile `full` e derivava a própria `DATABASE_URL` (`@db:5432`) porque o app rodava
no host: o profile existia para que `docker compose up -d` não subisse um app-em-container
brigando pela porta, e a `DATABASE_URL` própria existia porque o app-em-container alcança o
Postgres pelo **nome do serviço**, não por `localhost`. Com um override por ambiente, os dois artifícios deixaram de ser
necessários.
