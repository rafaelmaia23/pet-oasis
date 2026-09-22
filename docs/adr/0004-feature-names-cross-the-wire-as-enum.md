# Nome de feature atravessa a rede como enum, não como string

> Decisão de sistema, tomada pelo dono do projeto na Fase 11 e executada na issue 18
> (`.scratch/fase-11-monorepo/issues/18-feature-names-typed-in-the-views.md`). Vale para a
> fronteira entre a API e qualquer cliente dela. Estende a mesma régua de
> [`0003`](0003-route-table-is-contract-openapi-is-derived.md): se o cliente teria de digitar
> a string, a string é contrato.

`FEATURE_NAMES` já morava no contrato desde a issue 09, mas as views que **devolvem** nome de
feature o tipavam como `z.string()`. O efeito prático é que o catálogo tipado não chegava a
quem mais precisa dele: o web decide esconder afordância comparando nome de feature, e
`can(me, "raed:pet")` compilava, passava no lint e só aparecia em produção como um botão que
nunca surge — a pior classe de bug, porque não levanta erro nenhum.

Toda view que carrega nome de feature passa a usar `featureNameSchema` (o `z.enum` de
`FEATURE_NAMES`): a lista plana de `GET /me`, a de `GET /users/:id/effective-features`, o
override de `UserFeatureOverride`, o `UserAdmin`, as features de `Role` e o nome em `Feature`.
O `/openapi.json` publica `enum` nesses campos sem o adaptador mudar — ele já deriva do
contrato. O wildcard `*` é um nome do catálogo como outro qualquer, então o admin não é caso
especial.

O que torna isso seguro é o catálogo ser **fixo no código**: não existe rota que crie feature
(só `GET /features` e `GET /features/:id`), e o seed é um `Record<FeatureName, string>` — nome
fora da lista não chega ao banco por caminho nenhum. **Se um dia feature virar dado criável em
runtime, esta decisão cai junto**, e volta a ser `z.string()`.

## Consequences

O preço está no `createPresenter`, que faz `safeParse` na saída: um nome fora do catálogo
deixa de ser uma string estranha na resposta e passa a ser erro de apresentação (500). Isso é
desejado — falhar alto na API é melhor que o cliente receber uma capability que ele não sabe
interpretar —, e o catálogo fixo é o que mantém o caso fora do alcance.

O outro preço é de compatibilidade, e é assimétrico de propósito: a API ganhar uma feature
nova não quebra cliente nenhum **em runtime**, porque a decisão do web (ADR-0003 dele) é não
dar `.parse()` em resposta — a view entra só como tipo. Um cliente com o contrato velho
simplesmente não conhece o nome novo, que é o que já acontecia com `string`. O que muda é o
`typecheck`: nome novo exige atualizar o pacote, e é exatamente esse o acoplamento que o
monorepo existe para tornar visível no mesmo PR.

Autorização **interna** da API segue em `string` (`hasFeature`, `computeEffectiveFeatures`):
ali o valor vem do banco e é comparado, não digitado por quem escreve cliente. Estreitar
aquilo é outro trabalho, com outro motivo.
