# Cada pasta do tracker é uma fase, nomeada `fase-<n>-<slug>`

> Decisão de sistema, tomada em 2026-09-21 na grelha pós-import da Fase 11 e executada na
> issue 15. Vale para o tracker inteiro (`.scratch/` da raiz). Contexto de execução em
> `.scratch/fase-11-monorepo/issues/15-scratch-folders-are-phases.md`.

A skill de setup prescreve `.scratch/<feature-slug>/`: uma pasta por feature, sem ordem. Depois
do import do web o tracker tinha três pastas em três convenções — `fase-10-frontline/`,
`monorepo/` e `foundation-and-auth-spine/` —, e quem listava o diretório não sabia, sem abrir
nada, qual pasta era qual fase, em que ordem vinham, nem a que branch cada uma correspondia.

**Decidimos** que **pasta = fase**: todo diretório de `.scratch/` se chama `fase-<n>-<slug>/`,
flat, com o número global da fase (o mesmo de `docs/todo.md` e da branch `fase-<n>`) e um slug
em kebab-case. O `ls` sai em ordem cronológica, e a pasta casa 1:1 com a branch (`fase-11` ↔
`fase-11-monorepo/`). **Sem zero à esquerda**, porque a branch é `fase-11`, não `fase-011` —
um zero a mais numa e não na outra quebraria o casamento que justifica o padrão; a ordenação
lexicográfica só vai desalinhar da cronológica na centésima fase, e o `todo.md` ordena de
qualquer forma. **Não existe pasta sem número:** trabalho fora de fase é branch solta a partir
da `dev`, entrada em `docs/reference/backlog.md`, ou issue nova na fase aberta — o que o
`CLAUDE.md` já prescrevia para a pendência; o termo "esforço" sai do vocabulário do tracker.

**Subpasta por app foi rejeitada** (um `api/` e um `web/` dentro do tracker) porque uma fase
atravessa apps — a 11 toca API, contrato, web e infra; a 12 pede duas peças ao contrato — e
uma pasta por app obrigaria a partir a spec de uma fase ou a escolher um dono arbitrário. O
app aparece no slug quando a fase é de um só (`fase-12-web-auth-spine`).

**É o segundo desvio consciente do que a skill prescreve**, depois de `docs/adr/0001`, e pela
mesma razão: a skill pensa numa feature de um repositório só; aqui o tracker é o de um monorepo
com fases numeradas e branches que carregam esse número. O padrão é **provado pelo
`pnpm docs:check`**: cada diretório em `.scratch/` tem de casar com `fase-<n>-<slug>` e conter
`spec.md`, e toda menção em prosa a `.scratch/<pasta>/` ou a um arquivo dela tem de resolver —
é o que garante que renomear uma pasta corrige toda citação no mesmo passo (esta issue renomeou
duas, e o check foi a lista do que faltava).
