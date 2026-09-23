# O dataset inclui roles com escrita (`manager`), com o risco assumido

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Dataset fake*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Sinalizado explicitamente antes de implementar (mesmo racional de "credencial pública, risco baixo,
dado sempre restaurável" do `DEMO_PASSWORD`): sem isso o dataset não demonstraria as features de
gestão de usuário (ban, force-password-reset, permission override) na prática. Aceito
conscientemente, não por omissão.
