# 13: Fecho da fase — ADR, destilação, deploy e rename

**What to build:** a fase fecha com dono permanente para cada decisão, o guia de deploy
reescrito para o monorepo, `main` virando o monorepo, e o repo renomeado no GitHub para
`pet-oasis` — o último ato, porque é o momento em que `main` deixa de ser só a API.

**Blocked by:** 08, 12, 15.

**Status:** fechada em 2026-09-22

- [x] ADR de sistema na raiz (numerado): por que monorepo, por que in-place, por que pnpm +
      Turbo, o que é contrato e a regra dos dois donos, o que ficou de fora (deploy automático,
      remote cache, cache de `test`) e quando revisitar. → `docs/adr/0005-monorepo-in-place-pnpm-turborepo.md`.
      A regra dos dois donos e a fronteira do contrato **não** foram reescritas aqui: já têm
      dono nos ADRs `0198` e `0199` da API, e o `0005` diz a decisão de sistema e aponta para
      eles — duplicar seria criar duas versões envelhecendo em ritmos diferentes.
- [x] Índice dos ADRs de sistema criado: `docs/adr/README.md`, por tema, no molde do
      `apps/api/docs/adr/README.md`. São **sete** ADRs, não três como a issue previa — a 17 e a
      18 acrescentaram o `0003` e o `0004` depois que ela foi escrita, e o fecho acrescentou
      `0005`–`0007`. A linha de `adr/` na tabela de `docs/README.md` passou a apontar só para o
      índice, e o protocolo "leia o índice, abra um arquivo" do `CLAUDE.md` passou a nomear os
      **três** índices (raiz, API, web) em vez de só os dos apps.
- [x] Tabela de rastreio decisão → destino feita e conferida — abaixo. Nenhuma decisão da spec
      ficou sem dono; a primeira linha da spec virou `Status: fechada em 2026-09-22 — porquê
      promovido a …`.
- [x] Racionais que nasceram na execução e viviam só em comentário de código, promovidos:
      - Node e pnpm com fonte única (`engines` + `packageManager`, corepack; nenhum Dockerfile
        escreve versão de pnpm; o pnpm recusa Node fora de `engines`), o `.npmrc` que não
        existe, o `allowBuilds` (por que `vue-demi` entra e `sharp` não) e o `catalog:` com as
        duas exceções (TS 6, não 7; `@types/node` casando com `engines.node`) → **um ADR só**,
        `docs/adr/0006-one-source-for-node-pnpm-and-one-version-per-dependency.md`. É de
        **sistema**, não da API: os quatro moram em arquivos da raiz e valem para todo pacote —
        a issue previa ADR da API, e o critério "o que é do sistema vai no ADR da raiz", que
        ela mesma escreve, decidiu o contrário.
      - O stack Compose único (web só no override de produção; sem `depends_on: api`; `prod:*`
        na raiz e `dev*`/`test:services:*` na API; env por app, o da API como `--env-file`) e
        as imagens construídas da raiz com install filtrado (`pnpm deploy` antes do
        `next build` no web; `Dockerfile.dockerignore` por app) → **um ADR só**,
        `docs/adr/0007-single-compose-stack-one-image-per-app.md`, de sistema pelo mesmo
        critério (os arquivos são de `infra/` da raiz e o stack serve os dois apps).
      - O gotcha do bundle do Scalar (caminho real por `node_modules/.pnpm/…` × `sendFile`
        recusando segmento com ponto → `root` + arquivo relativo, em `src/docs/reference.ts`) →
        `apps/api/docs/adr/0202-bundle-scalar-vai-em-root-nao-caminho-absoluto-pnpm.md`, que é
        da **API** porque é código dela, indexado ao lado do `0130` que ele emenda.
- [x] `docs/todo.md` da raiz: Fase 11 destilada na forma fechada (9 bullets); a fase de
      carrinho/pedido/pagamento reaparece como **Fase 13**, "a fazer", com o que a Fase 9 já
      decidiu para ela preservado (`OrderItem` polimórfico, preço gravado, `StockMovement`).
- [x] Guia de deploy reescrito (`apps/api/docs/guides/deploy.md`): clone da **raiz** do
      monorepo, `.env.production` por app (o do web precisa existir mesmo vazio), `prod:up` da
      raiz, deploy de um serviço só nas duas direções com o `docker inspect` que confere,
      a rede API↔web que deixou de ser externa (só a `proxy` sobrou), os **dois** proxy hosts,
      o `chown` de uploads mantido, e a confirmação de que `container_name: pet-oasis-api` não
      mudou — as units systemd sobrevivem sem reinstalação. O guia ficou onde estava, no
      `docs/` da API, porque quase todo o detalhe operacional é dela; o `docs/README.md` da
      raiz passou a apontar para ele na linha de `guides/`.
- [x] `README.md` da raiz apresenta o monorepo (já apresentava, desde a 07/11; o fecho
      corrigiu a linha do tracker, que ainda dizia "issues por esforço", e os dois links de
      `CLAUDE.md` que apontavam para o da API em vez do da raiz). O do web já apontava para
      ele; o da API ganhou o ponteiro ("o que vale para o sistema está no README do monorepo
      e no `CLAUDE.md` da raiz"), o roadmap atualizado (10 e 11 fechadas, 12 aberta, 13 a
      fazer) e o badge de Node corrigido de 22 para 24.
- [x] Repo renomeado no GitHub para `pet-oasis` — feito pelo dono **antes** deste fecho (o
      `origin` já é `https://github.com/rafaelmaia23/pet-oasis.git`, e a API do GitHub
      confirma `full_name: rafaelmaia23/pet-oasis`). O rename era "o último ato" porque marca
      o momento em que `main` deixa de ser só a API; tendo acontecido antes, o que falta é só
      a `main` alcançá-lo.
- [ ] **Do dono, fora do alcance do agente:** merge `fase-11` → `dev` (`--no-ff`), PR com CI
      verde, merge `dev` → `main`, nova `dev` a partir da `main`; remote do VPS atualizado; um
      deploy real do stack a partir do monorepo, com API e web respondendo.

## Tabela de rastreio (decisão da spec → dono permanente), conferida em 2026-09-22

| Decisão ("Implementation Decisions") | Dono |
|---|---|
| In-place, repo é o mesmo; move num commit; `.git-blame-ignore-revs`; ordem das camadas (pnpm antes do move, contrato antes do web, CI antes do import); o web congela | `docs/adr/0005-monorepo-in-place-pnpm-turborepo.md` |
| Layout `apps/*` + `packages/*`, escopo `@pet-oasis/*` nunca publicado, `workspace:*`, um só pacote de contratos | `docs/adr/0005-…` (o layout e o "um só pacote"); `CLAUDE.md` da raiz (o mapa acionável) |
| `packages/tsconfig` com presets por alvo; `biome-config` como base que cada app estende | `apps/api/docs/adr/0103-tsconfig-biome-api-estendem-presets-workspace.md` |
| O que migra e o que não migra para o contrato; só depende de `zod`; a API importa do contrato; `exactOptionalPropertyTypes` | `apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md` (a fronteira caso a caso) e `0198-contrato-consumido-do-fonte-ts-so-depende-de-zod-enum-dois-donos.md` (a pureza e o fonte TS) |
| Enum tem dois donos, com teste de paridade | `apps/api/docs/adr/0198-…`; a regra acionável no `CLAUDE.md` da raiz |
| A tabela de rotas é contrato; o OpenAPI é derivado; prosa junto; alternativas recusadas | `docs/adr/0003-route-table-is-contract-openapi-is-derived.md` |
| `expiresIn` em segundos na resposta de login e refresh; `expiresAt` recusado | `apps/api/docs/adr/0200-login-e-refresh-anunciam-expires-in-em-segundos.md` |
| (acréscimo tardio, 18) Nome de feature atravessa a rede como enum | `docs/adr/0004-feature-names-cross-the-wire-as-enum.md` |
| pnpm pinado por `packageManager` + corepack; `engines.node`; `.npmrc` (que não sobreviveu); `allowBuilds` | `docs/adr/0006-one-source-for-node-pnpm-and-one-version-per-dependency.md` — **reescrito** narrando as duas divergências: o `.npmrc` foi apagado (pnpm 12 lê `pnpm-workspace.yaml`) e `sharp` não entra na lista |
| `catalog:` com uma versão por dependência compartilhada; "a mais nova sem breaking grande"; TS 6 × Next 16 como fato a verificar | `docs/adr/0006-…` — com as **duas exceções** e o fato verificado (Next 16.3.4 aceita TS 6; a API não desceu) |
| `turbo.jsonc` com `typecheck`/`lint`/`build` cacheados, `test` fora do cache, `dev` persistente, `^build` do contrato | `apps/api/docs/adr/0104-turborepo-pipeline-workspace-test-fica-fora-cache.md` |
| Contrato consumido do fonte TS (a "decisão de implementação" que a spec deixou em aberto) | `apps/api/docs/adr/0198-…` |
| Scripts: `prod:*` na raiz, `dev*`/`test:services:*` na API, `docs:check` da raiz | `docs/adr/0007-single-compose-stack-one-image-per-app.md`; a tabela de comandos no `README.md` da raiz |
| Dockerfile por app, contexto na raiz, imagem podada por `pnpm deploy`; `pnpm deploy` sem `--prod` e antes do `next build` no web; `Dockerfile.dockerignore` por app | `docs/adr/0007-…` (o desenho que vale para os dois apps) e `apps/api/docs/adr/0156-contexto-build-raiz-monorepo-runtime-podado-pnpm-deploy.md` + `0157-pacotes-internos-entram-imagem-duas-camadas-deploy-nao.md` (o lado da API) |
| (acréscimo tardio, 14) Estágio `base` comum no Dockerfile da API | `apps/api/docs/adr/0201-dockerfile-api-estagio-base-runtime-fora-dele.md`, com `0158` reescrito |
| Compose unificado em `infra/`, base + overrides, projeto por ambiente; a rede do web deixa de ser externa; a `proxy` continua | `docs/adr/0007-…`; `apps/api/docs/adr/0148-tres-redes-papeis-distintos-porta-api-despublicada.md` (revisto na 11.11) e o ADR-0004 do web |
| O VPS clona o monorepo inteiro; guia de deploy reescrito no fecho | `apps/api/docs/guides/deploy.md` |
| Um fluxo de branches para tudo; numeração de fase global; o web perde a exceção "não existe `dev`" | `CLAUDE.md` da raiz, § "TDD sempre, com fluxo de branches por fase"; a numeração também em `docs/guides/todo-phases.md` |
| Conventional Commits em inglês, escopo obrigatório e enum; mensagem de merge padrão do Git; nenhum trailer de agente | `apps/api/docs/adr/0196-conventional-commits-escopo-obrigatorio-recusados-hook.md`; a regra acionável no `CLAUDE.md` da raiz |
| CI de verificação, só o afetado, services do job, commitlint do PR; sem deploy automático e sem remote cache | `apps/api/docs/adr/0197-ci-verifica-so-afetado-services-do-job-no-lugar-do-compose.md`; o "o que ficou de fora, e quando revisitar" em `docs/adr/0005-…` |
| Docs: raiz com `CLAUDE.md`/`CONTEXT-MAP.md`/`docs/`/`.scratch/`; por app o específico; `CONTEXT.md` glossário puro; ADRs numerados; `docs/context/` migrado e extinto; a regra "permanente não cita o tracker" derrubada | `docs/adr/0001-domain-docs-follow-the-skill.md`; o mapa em `docs/README.md` |
| (revisto na 15) Pasta = fase, `fase-<n>-<slug>`, flat, sem zero à esquerda; subpasta por app recusada; provado pelo `docs:check` | `docs/adr/0002-tracker-folders-are-phases.md` |
| Pipeline `grill-with-docs → to-spec → to-tickets → implement` como o modo de trabalho de toda fase | `CLAUDE.md` da raiz, § "TODO, roadmap e o pipeline de trabalho"; o caminho desenhado em `docs/README.md` |
| ("Out of Scope") deploy automático, remote cache, cache de `test`, versionar/publicar/quebrar o contrato, apps novos | `docs/adr/0005-…`, § "O que ficou de fora, de propósito" — **cada item com o gatilho para revisitar**, que é o que a issue pedia e a spec não tinha |
| ("Testing Decisions") suíte HTTP como oráculo; paridade de enum; pureza do contrato; paridade de rotas | `apps/api/docs/adr/0198-…` (as duas guardas do contrato) e `docs/adr/0003-…` (a paridade de rotas); a prática, no `CLAUDE.md` da API |
| ("Fecho") ADR de sistema; rename do repo; `todo.md` destilado; decisões promovidas antes de fechar | Esta issue — os artefatos estão nos checkboxes acima; o rename já estava feito quando o fecho começou |
| ("Further Notes") 9 de 29 arquivos da API importavam enum do Prisma | `apps/api/docs/adr/0199-…` (a migração schema a schema) e `0198-…` (o teste de paridade que substituiu o acoplamento) |
| ("Further Notes") TS/Biome/`@types/node` divergentes entre API e web | `docs/adr/0006-…` — o `catalog:` e as duas exceções |
| ("Further Notes") o `.dockerignore` de cada app precisa excluir o **outro** app | `docs/adr/0007-…`, § "Uma imagem por app" |
| ("Further Notes") systemd chama o container pelo nome — conferir no fecho | **Conferido:** `container_name: pet-oasis-api` inalterado em `infra/docker-compose.prod.yml`; registrado no `deploy.md`, § "Timers de manutenção" |

Nenhuma decisão ficou sem dono. Três ADRs novos foram necessários (`docs/adr/0005`, `0006`,
`0007`) mais um da API (`0202`), e o índice de ADRs de sistema — que faltava desde a issue 07 —
nasceu junto.

## O que o code-review do fecho achou, e o que foi corrigido

Os dois sub-agentes de review pararam por limite de cota da conta (HTTP 429), então a revisão
foi feita à mão, nos mesmos dois eixos. Quatro achados, todos corrigidos antes do merge:

1. **Duplicação (padrão do repo: uma decisão, um dono).** O `0007` re-argumentava o desenho de
   redes, que é do `0148` da API, e o contexto de build com `Dockerfile.dockerignore`, que é do
   `0156`. Os dois trechos viraram ponteiro, e no lugar ficou só o que é de sistema: "rede que
   liga serviços do mesmo stack é do stack" e "como um app não vê o outro" (install filtrado +
   o glob de manifestos).
2. **Detalhe inventado.** O `0007` afirmava que a revisão da issue 11 "recusou a versão com um
   `COPY` por app"; a issue diz só que o critério é "um app novo não muda nenhuma dessas
   linhas". Reescrito para o que a fonte sustenta.
3. **Afirmação errada, repetida em dois lugares.** "Cachear `test` está no backlog **da API**"
   — o backlog é o da raiz, `docs/reference/backlog.md`. Corrigido no `0005` e no `README.md`
   da raiz (onde já estava errado antes desta issue).
4. **Estado envelhecido pelo próprio fecho.** O `CLAUDE.md` da raiz dizia "a Fase 11 está
   aberta"; passou a dizer fechada, com a 12 aberta e a 13 nomeada. O `deploy.md` dizia que a
   rede `pet-oasis` órfã "não atrapalha", enquanto o `0148` a trata como passo de transição de
   host — o guia passou a mandar removê-la, com o motivo.
