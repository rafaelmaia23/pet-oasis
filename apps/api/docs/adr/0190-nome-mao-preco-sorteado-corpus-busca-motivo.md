# Nome à mão, preço sorteado — e o corpus da busca é o motivo

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *Dataset fake do domínio (9.11)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Marca, categoria, tag e nome de produto são escritos à mão em pt-BR porque são o **corpus da busca**
da 9.9: a correção de erro de digitação só se demonstra sobre palavras reais em português. Preço,
custo e estoque saem de um `faker` semeado pelo SKU. `description` e `sku` acabaram à mão também,
pela decisão de usar **marcas reais**: uma descrição em inglês do `faker.commerce` embaixo de "Ração
Golden Fórmula Cães Adultos" seria absurda numa demo de portfólio, e `GLD-AD-15KG` é o que um SKU
real parece.

As marcas são reais (Golden, Whiskas, Pedigree, Sanol, Bravecto, Vetnil, Chalesco, Jambo, Furacão
Pet), com logo real, por decisão explícita do usuário. A ressalva registrada é que versionar o asset
num repositório público é **redistribuição**, não exibição por revendedor — que é a hipótese
usualmente tolerada. Risco avaliado como baixo e aceito; se algum dia incomodar, a troca é o
conteúdo de um arquivo de constantes e nenhuma linha de código muda.
