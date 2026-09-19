# Instância própria de Faker — e, desde a 9.11, semeada por chave

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Dataset fake*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`@faker-js/faker` exporta um singleton compartilhado; chamar `.seed()` nele mudaria o stream de
valores consumido por qualquer teste que rode no mesmo processo depois de o módulo de seed ser
importado — flakiness sutil dependente de ordem de import. `new Faker({ locale: [en] })` isola
completamente os dois geradores, e isso continua valendo.

O que **mudou na 9.11** é como a instância é semeada. Até então ela recebia um `seed()` fixo uma
vez e era consumida em laço, o que a tornava uma **sequência**: inserir uma entrada no meio do
`FAKE_USER_ROSTER` deslocava o stream e mudava nome e telefone de toda entrada posterior. A
idempotência nunca dependeu disso (a chave é o email), mas os valores divergiam entre um banco
antigo e um recriado, e o roster tinha uma ordem que importava por acidente do gerador — numa
sessão que justamente apende ao roster, com a Fase 10 vindo atrás.

`src/lib/seed/seedFaker.ts` passa a resemear a instância a partir de uma **chave estável** (os 4
primeiros bytes do SHA-256 do email, ou do SKU nas variantes do catálogo). O roster volta a ser um
conjunto: reordenável e extensível sem efeito colateral. Custo pago uma vez: os nomes de todos os
fakes mudaram numa execução em banco novo — bancos existentes não mudam, porque o rerun pula quem
já existe.
