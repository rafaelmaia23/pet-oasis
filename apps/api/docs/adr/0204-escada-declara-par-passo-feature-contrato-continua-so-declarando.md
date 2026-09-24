# A escada de views declara o par (passo, feature que destrava); o contrato continua só declarando

> Decisão da Fase 12 (issue 17), registrada em 2026-09-24. Contexto de execução em
> `.scratch/fase-12-module-depth/issues/17-a-escada-com-pares-passo-feature.md`.

A correspondência "qual degrau da escada este viewer recebe" não tinha dono: o contrato
declarava a escada como um array só de schemas, e a feature que destravava cada degrau era
prosa, reescrita verbatim em cada módulo que a usava — `chooseUserView`, `chooseProductReadView`/
`chooseProductWriteView` e `chooseVariantWriteView` repetiam a mesma forma (`hasFeature(actor,
"…") ? cost : internal`), e o filtro da listagem de produto (`canSeeInternal`) era um predicado
**separado** que podia divergir da view escolhida sem que nada acusasse.

A escada passa a declarar **pares** `{ view, feature }` — `feature: null` no degrau base, que
todo ator recebe — em vez de só os schemas. Isto move um passo a fronteira que o
[`0199`](0199-schemas-de-request-e-views-sao-codigo-do-contrato.md) desenhou, sem apagá-la: o
contrato passa a **declarar** a correspondência degrau → feature, mas continua sendo a API quem
**decide** — `chooseView`, em `apps/api/src/lib/viewLadder.ts`, é o único ponto que lê os pares e
escolhe um, e é ele quem toda escada da API passa a usar. O contrato não ganhou `AuthUser` nem
`hasFeature`; ganhou só o dado de que degrau X precisa da feature Y, que já era verdade e só não
tinha endereço.

A tabela de rotas continua recebendo um array de schemas em `responses[status].view` — é o que
`registerRoute` e o `/openapi.json` esperam, e é o invariante de contenção que a issue 02 provou
em `packages/api-contracts/tests/route-table.test.ts`. Cada `*.views.ts` deriva esse array dos
pares com `.map(rung => rung.view)`, então a escada continua tendo **uma** declaração — a dos
pares —, e o array plano é projeção dela, não uma segunda fonte.
