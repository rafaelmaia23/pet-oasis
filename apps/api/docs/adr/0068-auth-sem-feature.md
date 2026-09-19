# `/auth` sem feature

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Verificação de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Verificação, forgot e reset são operações self-service, no mesmo grupo público de
`login`/`signup`/`refresh` — quem as usa por definição ainda não está autenticado (ou age sobre a
própria identidade). O recurso central de cada uma é o **token**, não um recurso de domínio, por
isso `POST /auth/verify-email`, `/forgot-password`, `/reset-password` em vez de aninhar em
`/users/:id`. `change-password` é a exceção autenticada: exige `authenticate` mas nenhuma feature,
porque é o dono agindo na própria conta, travado pela senha atual.
