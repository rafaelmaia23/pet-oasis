# `POST` orienta, não cria perfil

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Vínculo user↔role*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Se `role.appliesTo` é incompatível com os perfis ativos → **422** cujo `action` orienta criar
o perfil primeiro. O endpoint **não** cria o perfil automaticamente: efeito colateral
silencioso é pior que um erro claro. Se o user já tem a role ativa → **409** (idempotência).
