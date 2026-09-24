# 17: A escada de views passa a declarar o par (passo, feature que destrava)

**What to build:** "qual view este viewer recebe" passa a ter um dono. Hoje a escada é declarada no
contrato como um array de schemas e a feature que destrava cada passo é **prosa**; a API restata o
mapa em camadas diferentes por recurso — controller num, serviço noutro, inline num terceiro — e a
mesma função de escolha está duplicada verbatim entre produto e variante. O comentário do próprio
serviço de produto avisa que o filtro da listagem e a view escolhida não podem divergir, e depois
confia nos dois callers lembrarem. O esforço do web precisa do mesmo mapa para decidir afordância, e
seria o quarto lugar a reescrevê-lo.

**Esta issue começa por um ADR**, antes de qualquer código: ela mexe na fronteira que o ADR-0199 da
API desenhou ("quem sabe o que o viewer pode é a API, não o contrato"). O esboço fica do lado certo
dela — o contrato **declara** a correspondência, a API continua **decidindo** —, mas quem lê no
futuro precisa achar o porquê de a fronteira ter se movido um passo.

**Blocked by:** 02 (a contenção da escada é um dos invariantes provados lá).

**Antes de começar, leia a seção "Uma terceira consequência, descoberta na issue 11" da
`spec.md`.** A escada já tem um ponto de leitura só por rota — o `chooseView` do registro
(`apps/api/src/lib/registerRoute.ts`) —, e quem o preenche hoje é uma função por módulo
(`chooseUserView` em `apps/api/src/modules/user/user.view-resolver.ts`, e o equivalente em
produto e variante). O que esta issue colapsa são **essas funções**, sobre os pares (passo,
feature) declarados; o seam em si já existe e não precisa ser desenhado de novo.

**Status:** fechada em 2026-09-24

O que de fato ficou pronto:

- [x] ADR novo na API — `apps/api/docs/adr/0204-escada-declara-par-passo-feature-contrato-continua-so-declarando.md`,
      com a linha em `apps/api/docs/adr/README.md` —, escrito **antes** do código, registrando o
      passo que a fronteira do ADR-0199 deu: o contrato passa a declarar o par (degrau, feature),
      a API continua decidindo.
- [x] Cada escada do contrato (`userViewLadder`, `productReadLadder`, `productWriteLadder`,
      `variantWriteLadder`, `productListLadder`) passa a declarar pares `{ view, feature }`
      — `feature: null` no degrau base —, em vez de só os schemas. `productReadLadder`,
      `productWriteLadder` e `variantWriteLadder` migraram de constantes locais e sem dono em
      `packages/api-contracts/src/routes/product.routes.ts` para `catalog/product.views.ts`, ao
      lado das views que descrevem — o mesmo endereço de `userViewLadder`. Cada `*Ladder` deriva o
      array de schemas que a tabela de rotas precisa (`*Schemas`, ex. `productReadSchemas`) com um
      `.map(rung => rung.view)`.
- [x] As cinco funções de escolha de view da API (`chooseUserView`, `chooseProductReadView`,
      `chooseProductWriteView`, `chooseVariantWriteView`, `chooseProductListView`) colapsam sobre
      um `chooseView` só, em `apps/api/src/lib/viewLadder.ts`: percorre a escada do degrau base ao
      mais alto e devolve o último cujo par o ator alcança. A decisão continua na API — o contrato
      não ganhou `AuthUser` nem `hasFeature`.
- [x] A duplicação verbatim entre produto e variante (`hasFeature(actor, "read:product:cost") ?
      "cost" : "internal"`, repetida em `product.service.ts` e `product.variant.service.ts`) deixa
      de existir: as duas funções `viewFor` foram removidas, e a escolha passa pelo `chooseView`
      genérico sobre `productWriteLadder`/`variantWriteLadder`.
- [x] `canSeeInternal` (o filtro da listagem) e a view escolhida passam a sair da mesma declaração:
      `canSeeInternal` virou `reachesBeyondBase(productReadLadder, actor)`, uma segunda função de
      `viewLadder.ts` que deriva de `chooseView` — os dois não têm mais como divergir.
- [x] Teste tabelado do mapa feature → passo em `apps/api/tests/unit/lib/viewLadder.test.ts` (18
      casos): uma tabela por escada (`userViewLadder`, `productReadLadder`, `productWriteLadder`,
      `variantWriteLadder`, `productListLadder`), mais os casos de borda de `chooseView` (ator
      ausente, ator sem nenhuma feature da escada, feature de degrau baixo não vencendo uma já
      concedida de degrau alto) e de `reachesBeyondBase`.
- [x] Os `*.presenter.ts` não foram tocados — `product.presenter.ts` continua idêntico, inclusive o
      comentário que ainda cita `readViewFor` (a prosa ficou desatualizada de propósito, para não
      violar o item).
- [x] Nenhuma view ganhou ou perdeu campo; a suíte completa (88 arquivos, 1450 testes, incluindo os
      testes de integração de vitrine e de usuário) segue verde sem alteração nos arquivos de
      teste de integração. `typecheck`, `lint` e `docs:check` verdes; `code-review` sem achados.
