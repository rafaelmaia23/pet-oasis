# 21: Fecho da Fase 10

**What to build:** o ritual de fecho de `docs/guides/todo-phases.md`, mais dois itens que a spec
mandava fazer "no fecho" e que estavam pendurados na issue 14 (fechada como trabalho de front).

**Blocked by:** nada — 04, 06, 10 e 20 fecharam em 2026-09-16. É a última issue da fase.

**Status:** fechada em 2026-09-16


- [x] O aviso "⚠️ Este guia descreve o estado-alvo da Fase 10" no topo de
      `docs/guides/integrating-with-the-api.md` sai (a spec: "O aviso sai no fecho").
- [x] `docs/reference/backlog.md`: as entradas de "Necessidades do front web" são marcadas como
      resolvidas; a premissa "guardar o hash anterior na sessão" (item "Janela de graça na rotação
      do refresh token", ~linha 188) é **reescrita narrando a correção** da 10.7 (o par em texto
      claro no Redis, chaveado pelo hash apresentado — não coluna na `Session`), do mesmo jeito
      que a de "dois saltos" já foi (linha ~228, feito na 10.2).
- [x] Achado do deploy da 04 ganha dono em `docs/context/infrastructure.md` (decisão da 10.4) e no
      `deploy.md` § "Diretório de uploads": redeploy preserva o volume do banco, os bytes das imagens
      morreram com o container antigo, o seed não regrava, 404 em toda imagem com `SEEDING
      COMPLETED!` limpo; `demo-reset` conserta na demo. E no `chown`, o que importa é o número
      1000, não o nome do usuário do host.
- [x] Tabela de rastreio decisão → dono permanente: cada decisão de "Implementation Decisions" da
      `spec.md` tem `###` em `docs/context/` ou ADR. Conferir uma a uma; escrever o dono que
      faltar. Atenção às reescritas tardias (06: nome, sem 301, NPM + Cloudflare; 14: fechada do
      lado do backend — a "ordem obrigatória" da spec foi relaxada por decisão do usuário, e o
      contexto precisa narrar isso).
- [x] Primeira linha da `spec.md` vira `Status: fechada em <AAAA-MM-DD> — porquê promovido a
      <caminhos>`.
- [x] `docs/todo.md`: o bloco da Fase 10 encolhe para a forma de fase fechada (~10 bullets, um
      por grupo de issues, com os ponteiros).
- [x] Suíte completa + `typecheck` + `lint` + `docs:check` verdes na `fase-10`.
- [x] Merge `fase-10` → `dev` (`--no-ff`); suíte verde na `dev`; merge `dev` → `main`; nova
      `dev` a partir da `main`.

## Tabela de rastreio (decisão da spec → dono permanente), conferida em 2026-09-16

| Decisão ("Implementation Decisions") | Dono |
|---|---|
| `code` parametrizável nas factories; status não mudam; os três `code`s; ordem de avaliação | `identity-and-sessions.md` § "403 (não 401) no login", emenda **(10.8)** |
| Serviço renomeado `app` → `api`; o que **não** se renomeia; alias explícito | `infrastructure.md` § 10.1 |
| Três redes; porta despublicada; `docker network connect` some; `pet-oasis` externa | `infrastructure.md` § 10.2 (revisto na 10.17); alias fora da `proxy` no mesmo `###` |
| Systemd units e a ordem "reinstalar antes do deploy" | `infrastructure.md` § 10.1 (a decisão); o procedimento em `infra/cron/README.md` § "Trocar as units" |
| `X-Forwarded-For` por endereço de origem; copiar ou acrescentar, tanto faz; seguro porque a porta não é publicada; Cloudflare na frente | `security.md` § "`trust proxy` é por endereço de origem" (D7, 10.2, 10.6) |
| Janela de graça: par no Redis com TTL; 10 s como constante; quatro casos; 503 é "não decidir"; duas razões de 503; ação própria no audit; "sessão" é elo de corrente | `identity-and-sessions.md` § 10.7 — com 10.15 (ponta viva, teto de 5) e 10.18 (`graceDeferredAt`) dentro |
| CORS: `APP_URL` sai da allowlist; mobile não é motivo | `security.md` § 10.11 |
| Domínio: subdomínio primeiro, `APP_URL` depois; sem migration; sem mudança na spec | `infrastructure.md` § 10.6 — reescrita com o nome de primeiro nível, sem 301, NPM + desafio DNS, e a ordem **relaxada** na 10.14 por decisão do usuário |
| Seed fora do caminho crítico / fail-open por classe de dado | `infrastructure.md` § 10.3 |
| Uploads fora do working tree; uid fixado | `infrastructure.md` § 10.4 — com 10.16 (dev), 10.19 (absoluto) e 10.21 (bytes morrem com o container) dentro |
| OpenSSL no runtime (e no build) | `infrastructure.md` § 10.5 |
| Timing attack: hash dummy; teste é chamada de julgamento | `identity-and-sessions.md` § 10.9 |
| Comprimento máximo em todo texto | `security.md` § 10.13 |
| Mass assignment: `.strict()` + teste de regressão | `security.md` § 10.12; ponteiro em `CLAUDE.md` |
| JWT: algoritmo pinado, `iss`/`aud`, folga de relógio; tokens em voo invalidados | `security.md` § 10.10 |
| ("Further Notes") as duas premissas do backlog corrigidas | `docs/reference/backlog.md`, itens riscados narrando a correção (10.2 e 10.7/15/18) |

Nenhuma decisão ficou sem dono; nenhum `###` novo foi necessário nesta issue — os acréscimos
tardios (10.14 relaxada, 10.21 bytes) entraram como parágrafos nas decisões que emendam.
