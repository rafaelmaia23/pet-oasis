# `src/lib/` não conhece módulo nenhum

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Onde cada coisa vive*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Quando os três guards de escalação viraram `assertActorIsAdmin`, o helper passou a receber o ator
**já buscado** em vez de buscá-lo. Buscar dentro dele eliminaria mais uma linha por chamador, mas
obrigaria `src/lib/` a importar `userRepository` — `lib` é a camada transversal, e furar isso por
uma linha sairia mais caro que a duplicação restante.
