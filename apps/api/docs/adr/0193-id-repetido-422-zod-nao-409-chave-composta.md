# Id repetido é 422 do Zod, não 409 da chave composta

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *O que o fecho da fase (9.12) corrigiu no catálogo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`categories`/`tags` com o mesmo id duas vezes furavam a PK do vínculo, e o handler de P2002
traduzia aquilo para um 409 falando de `product_id` — erro que manda procurar o problema no
lugar errado. A recusa foi para o schema, junto das que a lista de variantes (SKU repetido) e
o array de reordenação de imagem já faziam.
