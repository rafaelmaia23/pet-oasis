# Leitura por RSC, escrita por Server Actions, sem cache de dados no cliente

Com a sessão no servidor (ADR-0001), o servidor já tem o token — buscar dados no cliente
significaria proxyar de volta pelo nosso próprio BFF, mais trabalho para menos. Listas usam
`searchParams` como estado, mutações usam Server Actions, e não há TanStack Query nem
equivalente no projeto.

## Consequences

- O back-office é quase inteiramente tabela com filtro, ordenação e paginação, e a API já
  expõe isso como query string. `searchParams` mapeia 1:1, o que dá URL compartilhável,
  botão voltar funcionando e nenhum estado duplicado.
- O `errors` por campo do 422 da API cai direto em `useActionState`.
- Isto **não** é proibição. Uma tela específica que precise de mutação otimista (reordenar
  imagem de produto por arrastar, por exemplo) pode adotar TanStack Query localmente.
  Adicionar depois é barato; começar com duas fontes de verdade e arrancar uma, não.
