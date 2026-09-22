# 18: Nome de feature atravessa a rede como enum, não como string

**What to build:** onde um **nome de feature** sai na resposta da API, o contrato passa a
tipá-lo com `featureNameSchema` (o `z.enum` de `FEATURE_NAMES`) em vez de `z.string()`. É o
que faz a user story 3 da fase valer de verdade no cliente: hoje `FEATURE_NAMES` existe no
contrato, mas a view `me` devolve `string[]`, então o web perde autocomplete e checagem
exatamente no ponto em que decide esconder afordância — e `can(me, "raed:pet")` compila.

Decisão do dono do projeto (2026-09-22), tomada sobre o achado do code-review da issue 12.

**Blocked by:** 12 — o achado veio de lá, e é o `featuresOf` do web que colhe o ganho.

**Status:** ready-for-agent

- [ ] O catálogo é fixo no código: features e roles são **somente leitura** na rede (não há
      `POST /features`), e o seed é chaveado por `FeatureName`. Confirmar que segue assim —
      se um dia a feature virar dado criável em runtime, esta decisão cai junto.
- [ ] `featureNameSchema` no lugar de `z.string()` em toda view que carrega nome de feature:
      a lista plana de `me`, a lista plana de `GET /users/:id/effective-features`, o override
      de `userFeatureViews`, o `adminView` de usuário, as features de `roleViews` e o nome em
      `featureViews`. O wildcard `*` já está em `FEATURE_NAMES`, então o admin sobrevive.
- [ ] Teste que prova os dois lados em cada view tocada: nome do catálogo (inclusive `*`)
      passa, nome fora dele é recusado. É teste novo, escrito antes da mudança.
- [ ] O `createPresenter` faz `safeParse` em runtime: estreitar transforma "nome fora do
      catálogo" em erro de apresentação (500), não em resposta torta. Decidir e registrar se
      isso é o desejado — é o preço da checagem, e o que o torna aceitável é o catálogo ser
      fixo no código.
- [ ] O `/openapi.json` passa a publicar `enum` no lugar de `string` nesses campos; conferir
      que o adaptador deriva isso sozinho e que a suíte de OpenAPI segue verde.
- [ ] `featuresOf` do web devolve `readonly FeatureName[]`, e a prova negativa continua de pé.
- [ ] ADR registrando a decisão e o trade-off (cliente velho × API que ganha feature nova).
- [ ] Suíte inteira, `typecheck`, `lint` e `docs:check` verdes.
