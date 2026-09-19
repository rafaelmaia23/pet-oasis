# Role `demo` sempre semeada, usuário demo atrás de flag

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Seeds e ambiente demo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O objetivo é deixar qualquer visitante exercitar o RBAC ao vivo (todo `GET` → 200, toda escrita →
403) sem sujar ou quebrar dados. A role `demo` (`appliesTo EMPLOYEE`, só features de leitura) faz
parte do catálogo e é sempre semeada. Já o **usuário** só nasce com `SEED_DEMO_USER=true` (ligado no
Docker/prod, desligado em dev/test para não sujar a suíte). Assim o mesmo seed serve os três
ambientes sem ramificar além desse flag. As credenciais são públicas de propósito
(`env.DEMO_EMAIL`/`DEMO_PASSWORD`), e o seed limpa `bannedAt`/`bannedBy`/`banReason` no update — um
redeploy sempre restaura o demo utilizável.
