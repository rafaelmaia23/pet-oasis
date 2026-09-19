# Redis, não in-memory

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Rate limit e lockout*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Os dois mecanismos compartilham a mesma necessidade: um contador que sobreviva a restart do
processo e funcione mesmo se a app um dia rodar em mais de uma instância. In-memory
(`express-rate-limit` puro) resolveria o caso atual (single-instance), mas quebraria
silenciosamente no primeiro dia de scale-out e zeraria a cada deploy. Custo aceito: um serviço
novo nos overrides do Compose e mais uma peça de infra em produção.
