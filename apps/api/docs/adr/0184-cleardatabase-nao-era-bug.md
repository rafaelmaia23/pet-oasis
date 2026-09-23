# `clearDatabase` não era bug

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Achado de teste*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Ele só apaga tabelas transacionais; `Feature`/`Role`/`RoleFeature` (seed do `globalSetup`) já eram
preservadas entre testes — que é o que as factories precisam. Ganhou teste-guarda
(`clearDatabase.guard.test.ts`) contra regressão futura.
