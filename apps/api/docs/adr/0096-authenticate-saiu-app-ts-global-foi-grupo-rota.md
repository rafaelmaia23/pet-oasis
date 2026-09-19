# `authenticate` saiu do `app.ts` (global) e foi para o grupo de rota

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Roteamento*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Rotas públicas de autenticação (`/auth/login`, `/auth/signup`, `/auth/refresh`) não podem depender
de já estar autenticado — em especial `/auth/refresh`, cujo propósito é recuperar acesso quando o
access token expirou. Com `authenticate` global, um Bearer expirado nesse header derrubava a
requisição com 401 antes de chegar na rota, mesmo sem `canAccess`.

A correção aplica `authenticate` só nos grupos protegidos (`/me`, `/users`, `/users/:userId`,
`/features`, `/roles`), deixando `/status` e `/auth` de fora — **de propósito, não por omissão**.
`logout`, `GET /auth/sessions` e `DELETE /auth/sessions/:id` são protegidos mas vivem dentro do
`/auth` público, então cada uma aplica `authenticate` + `canAccess` diretamente na própria
definição de rota (`auth.routes.ts`), não no grupo inteiro.
