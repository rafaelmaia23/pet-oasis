# `migrate deploy`, nunca `migrate dev`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`migrate dev` é interativo, pode gerar/aplicar migrations novas e **resetar o banco** em caso de
drift — inaceitável num servidor. `migrate deploy` só aplica as migrations já versionadas, de forma
idempotente e não-interativa. O entrypoint faz `migrate deploy → seed → start`: a subida deixa um
ambiente do zero funcionando. O seed é idempotente (upserts), então rodar a cada start é seguro.
