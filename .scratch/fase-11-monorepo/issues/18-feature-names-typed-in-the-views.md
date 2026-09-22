# 18: Nome de feature atravessa a rede como enum, não como string

**What to build:** onde um **nome de feature** sai na resposta da API, o contrato passa a
tipá-lo com `featureNameSchema` (o `z.enum` de `FEATURE_NAMES`) em vez de `z.string()`. É o
que faz a user story 3 da fase valer de verdade no cliente: hoje `FEATURE_NAMES` existe no
contrato, mas a view `me` devolve `string[]`, então o web perde autocomplete e checagem
exatamente no ponto em que decide esconder afordância — e `can(me, "raed:pet")` compila.

Decisão do dono do projeto (2026-09-22), tomada sobre o achado do code-review da issue 12.

**Blocked by:** 12 — o achado veio de lá, e é o `featuresOf` do web que colhe o ganho.

**Status:** fechada em 2026-09-22

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] Catálogo confirmado fixo no código: `GET /features` e `GET /features/:id` são as únicas
      rotas de feature (não há `POST`), e o seed é `Record<FeatureName, string>` — nome fora
      da lista não chega ao banco. As factories de teste conectam por nome
      (`feature: { connect: { name } }`), então nem a suíte consegue inventar um.
- [x] `featureNameSchema` nas **seis** views que carregam nome de feature: `me`,
      `effectiveFeatures`, o override de `userFeatureViews`, o `adminView` de usuário,
      `roleViews` e `featureViews`. O wildcard `*` já é membro de `FEATURE_NAMES`, então o
      admin continua passando — provado por teste próprio, não por inspeção.
- [x] Teste escrito **antes** (`packages/api-contracts/tests/feature-names-in-views.test.ts`):
      três casos por view — nome do catálogo passa, `*` passa, `raed:pet` (o erro de digitação
      que o enum existe para pegar) é recusado. Vermelho exato na primeira rodada: os 6 casos
      de recusa falharam e os 12 positivos passaram.
- [x] O `safeParse` do `createPresenter` transforma nome fora do catálogo em erro de
      apresentação (500). **É o desejado**, e o ADR diz por quê: falhar alto na API é melhor
      que entregar ao cliente uma capability que ele não sabe interpretar — e o catálogo fixo
      mantém o caso fora de alcance.
- [x] `/openapi.json` publica `enum` sem o adaptador mudar uma linha — verificado no documento
      gerado (`Me`, `EffectiveFeatures` e `Feature` saem com a lista inteira). A suíte de
      OpenAPI seguiu verde.
- [x] `featuresOf` do web devolve `readonly FeatureName[]`, e as três provas negativas da
      issue 12 continuam de pé.
- [x] `docs/adr/0004-feature-names-cross-the-wire-as-enum.md`, indexado em `docs/README.md`,
      com o trade-off e a condição que derruba a decisão (feature virar dado criável em
      runtime).
- [x] **Fora de escopo por decisão:** a autorização interna da API (`hasFeature`,
      `computeEffectiveFeatures`, `makeAuthUser`) segue em `string` — ali o valor vem do banco
      e é comparado, não digitado por quem escreve cliente. Está dito no ADR.
- [x] Suíte inteira (1367 da API + 50 do pacote, 18 deles novos), `typecheck`, `lint` e
      `docs:check` verdes.
