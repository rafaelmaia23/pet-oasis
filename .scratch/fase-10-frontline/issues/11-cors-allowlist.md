# 11: Tirar a URL pública do cliente da allowlist de CORS

**What to build:** a allowlist deixa de conceder origem por inércia. Hoje a URL pública do
cliente entra na allowlist por ser presumidamente quem chama por navegador. Depois da migração
de domínio ela passa a ser o front — que adota BFF e **não** chama por navegador, porque quem
fala com a API é o servidor dele. A entrada viraria permissão concedida a um consumidor que não
existe.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-14

- [x] A allowlist deixa de derivar da variável de URL pública do cliente, e passa a sair só da
      variável explícita de origens permitidas.
- [x] O middleware e a variável explícita **ficam**, para o dia em que existir um cliente de
      navegador de outra origem.
- [x] O guia de integração diz onde CORS **não** se aplica: cliente com BFF (a requisição não
      tem origem), app mobile nativo (não há navegador nem preflight), script e coleção de
      requisições. App mobile **não** é motivo para manter allowlist.
- [x] Testes existentes de preflight e de origem fora da allowlist continuam verdes, com a
      allowlist agora vindo só da variável explícita.

---

## Fecho (2026-09-14)

`src/config/cors.ts` monta a allowlist **só** de `CORS_ALLOWED_ORIGINS`, via `parseAllowedOrigins`
(função pura: split, trim, barra final fora, vazios fora) e um `normalizeOrigin` compartilhado
entre o que entra na lista e o que chega no header `Origin`. A `APP_URL` continua existindo só
para o que sempre foi dela — os links dos emails. O middleware e a variável ficam; os comentários
de `src/config/env.ts` e do `.env.example` passam a dizer quem entra (página web de outra origem
chamando direto do JavaScript) e quem **não** entra (front com BFF, app mobile nativo).

O guia de integração já tinha a seção "CORS: quando se aplica, e quando não" (veio com o próprio
guia, no commit que versionou o tracker); a frase "não há allowlist implícita" dela era **falsa** até este item e passa a
ser verdadeira — a issue não precisou tocá-lo.

**Testes.** `tests/unit/config/cors.test.ts` (parse do CSV; vazio/ausente → lista vazia) e, em
`security.test.ts`, o preflight passa a usar uma origem que vem de `CORS_ALLOWED_ORIGINS` e um
caso novo prova que a `APP_URL` **não** ganha origem. As duas variáveis são fixadas no próprio
arquivo por `vi.hoisted` (roda antes dos imports, então `@/config/env` já as lê fixadas): o
teste não depende do `.env.test` de cada máquina. Vermelho verificado antes da implementação
(a `APP_URL` ainda entrava; a função não existia).

Decisão registrada em `apps/api/docs/adr/README.md#segurança` ("A allowlist de CORS sai só da variável
explícita — a `APP_URL` não entra por inércia (10.11)") + linha no índice. Revisão de duas
trilhas (padrões + spec) sem violação; os julgamentos aplicados viraram o commit de refactor.

Suíte completa, `typecheck`, `lint` e `docs:check` verdes.
