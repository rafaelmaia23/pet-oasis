# Arquitetura — camadas, roteamento e onde vive o quê

> O fluxo rígido (route → controller → service → repository) está no `CLAUDE.md`. Aqui ficam as
> decisões de encaixe: os pontos em que a regra foi testada e o que se decidiu quando ela
> conflitou com outra.

---

## Roteamento

### `authenticate` saiu do `app.ts` (global) e foi para o grupo de rota

Rotas públicas de autenticação (`/auth/login`, `/auth/signup`, `/auth/refresh`) não podem depender
de já estar autenticado — em especial `/auth/refresh`, cujo propósito é recuperar acesso quando o
access token expirou. Com `authenticate` global, um Bearer expirado nesse header derrubava a
requisição com 401 antes de chegar na rota, mesmo sem `canAccess`.

A correção aplica `authenticate` só nos grupos protegidos (`/me`, `/users`, `/users/:userId`,
`/features`, `/roles`), deixando `/status` e `/auth` de fora — **de propósito, não por omissão**.
`logout`, `GET /auth/sessions` e `DELETE /auth/sessions/:id` são protegidos mas vivem dentro do
`/auth` público, então cada uma aplica `authenticate` + `canAccess` diretamente na própria
definição de rota (`auth.routes.ts`), não no grupo inteiro.

---

## Onde cada coisa vive

### A gravação transacional do audit vive no repository; o service passa o descritor

A política exige que a linha de audit de uma ação que muda estado entre na **mesma** `$transaction`
da mutação; a regra de camadas diz que só o repo toca o Prisma, e é lá que a transação vive.
Conciliar os dois: o service decide a semântica (action/targetType/targetId/metadata — decisão de
negócio) e passa um `AuditDescriptor` ao método de escrita do repo, que roda mutação +
`record(descriptor, tx)` numa transação interativa. A alternativa (service abrir
`prisma.$transaction` e passar `tx` ao repo) daria call sites mais idiomáticos, mas furaria "só o
repo toca o Prisma" — preterida.

### `record` é lib de observabilidade, não repository

Ela pode escrever no Prisma de qualquer camada (o login falho grava direto do service), pelo mesmo
enquadramento do `logger`/`AsyncLocalStorage`: observabilidade, não dado de negócio. Com `tx`
propaga o erro (rollback); sem `tx` engole e loga.

### `src/lib/` não conhece módulo nenhum

Quando os três guards de escalação viraram `assertActorIsAdmin`, o helper passou a receber o ator
**já buscado** em vez de buscá-lo. Buscar dentro dele eliminaria mais uma linha por chamador, mas
obrigaria `src/lib/` a importar `userRepository` — `lib` é a camada transversal, e furar isso por
uma linha sairia mais caro que a duplicação restante.

### `src/scripts/` é código; `infra/` é agendamento

`src/scripts/` importa Prisma/`env`/`logger` e é bundlado pelo tsup. `infra/` guarda o agendamento
(systemd timer, preferido a cron por dar `journalctl`, `Persistent=` e proteção contra sobreposição).

### SQL cru vive exclusivamente no repository

Necessário só para busca textual (`tsvector`/`pg_trgm`, Fase 9), via `$queryRaw` com template
parametrizado — nunca concatenação, nunca fora dessa camada. O corte de camadas se mantém mesmo
quando a ferramenta é SQL puro. Ver [`text-search.md`](../adr/text-search.md).

---

## Ordem de construção

### Perfis antes de user↔role

Atribuir role exige o perfil compatível já existir. Se user↔role viesse antes, dependeria de algo
inexistente. Detalhe em [authorization.md](authorization.md#perfis-vêm-antes-de-userrole).

### Primitiva de repositório antes da rota que a expõe

Quando uma mecânica serve a três níveis e só um tem rota, os três nascem juntos no repositório, com
os sem-rota cobertos por teste de integração chamando o repositório direto. Foi assim com a
restauração (K7) — ver [lifecycle.md](lifecycle.md#os-três-níveis-nasceram-como-primitivas-de-repositório-k7).

### Código reaproveitado entre entrypoints não pode carregar auto-execução

Lição do reseed compartilhado (7.14) — ver
[infrastructure.md](infrastructure.md#gotcha-do-reseed-compartilhado-714).
