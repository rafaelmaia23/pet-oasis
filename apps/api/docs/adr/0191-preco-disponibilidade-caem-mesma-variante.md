# Preço e disponibilidade caem na mesma variante

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *O que o fecho da fase (9.12) corrigiu no catálogo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

As duas cláusulas escreviam a mesma chave `variants` do `where`, e a segunda apagava a
primeira: `?inStock=` descartava `?minPrice=`/`?maxPrice=` **em silêncio**. Ao juntá-las,
foi preciso decidir o que a combinação significa, e a escolha é **a mesma variante satisfaz
as duas**: "até R$ 20 e em estoque" é uma pergunta sobre o que dá para comprar, e o produto
cuja variante barata está esgotada não a responde — mesmo tendo outra disponível por trinta
vezes o preço. `?inStock=false` é a exceção e continua sendo do **produto** ("esgotado" = não
ter nenhuma variante em estoque), porque é a negação da compra, não uma variante específica.
