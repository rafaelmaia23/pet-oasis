# Marca não sai com produto ativo pendurado

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *O que o fecho da fase (9.12) corrigiu no catálogo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Espelho da regra da categoria (W3), que a 9.6 tinha deixado pela metade — o
`countActiveProductsOfBrand` existia no repository e ninguém o chamava. Sem a guarda, a marca
sumia de `GET /brands` e continuava embutida em toda resposta de produto; e "sumir do
produto" não é alternativa, porque `Product.brandId` não é nulável. A contagem passou para o
repositório da **marca**, onde a categoria já mantinha a sua.
