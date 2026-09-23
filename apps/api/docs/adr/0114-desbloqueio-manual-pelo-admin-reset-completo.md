# Desbloqueio manual pelo admin, e reset completo

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Um usuário legítimo travado (esqueceu a senha e errou várias vezes antes de pedir reset) não
deveria esperar o backoff vencer sozinho. O desbloqueio (`manage:user:status`, mesma feature do
ban/unban) limpa contador **e** nível de backoff — mesmo idioma de unban: restaura o estado
anterior, não deixa resíduo. Não existe "lock manual" pelo admin (lock só acontece
automaticamente) — fora de escopo, registrado no [backlog](../../../../docs/reference/backlog.md).
