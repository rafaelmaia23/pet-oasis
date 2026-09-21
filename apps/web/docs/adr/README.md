# ADRs do web — índice

> Um roteador, como o da API: ache a decisão de que você precisa, abra **só** o ADR dela.
> Cada arquivo é **uma decisão**, no formato da skill `domain-modeling`: título, contexto e
> porquê. A numeração é sequencial (veio assim do repositório `pet-oasis-web`, importado na
> Fase 11): ADR novo ganha o próximo número e entra aqui. Decisão que vale para o sistema
> inteiro — a fronteira entre os apps, o que é contrato — vive em `docs/adr/` da raiz.
>
> O vocabulário (o que cada termo significa) é o [`CONTEXT.md`](../../CONTEXT.md) do web; o
> essencial acionável está no `CLAUDE.md`; o estado das tarefas, no `docs/todo.md` da raiz.

## Arquitetura

- [0001 — A sessão vive num BFF no front, não no cliente](0001-bff-session-in-frontend.md):
  cookie `httpOnly` criptografado, rotação proativa no middleware com três travas contra
  falso positivo de reuso, refresh da API guardado na sessão própria e nunca no navegador.
- [0002 — Leitura por RSC, escrita por Server Actions, sem cache de dados no cliente](0002-rsc-server-actions-no-client-cache.md):
  server-first; `"use client"` só quando a interação exigir; `searchParams` como estado de
  lista.
- [0003 — Os schemas vêm do contrato compartilhado; Zod valida formulário, não resposta](0003-types-generated-from-openapi.md):
  `@pet-oasis/api-contracts` no lugar de tipos gerados do OpenAPI (revisto in-place); a
  validação que decide é a da API.

## Infraestrutura

- [0004 — O apex passa a servir o front; a API vai para um subdomínio](0004-apex-for-frontend-api-on-subdomain.md):
  `pet-oasis.maiahub.com.br` é o front, `pet-oasis-api.maiahub.com.br` a API; duas redes
  (a `frontend` do stack e a `proxy` do nginx), porta não publicada, `X-Forwarded-For`
  repassado em toda chamada feita em nome de um visitante.

## Testes

- [0005 — Não escrevemos teste de markup](0005-no-markup-tests.md): duas costuras só
  (Playwright com tudo real; a fronteira do módulo de sessão com relógio e cliente
  injetados); função pura se testa direto.
