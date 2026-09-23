# 02: Invariantes da tabela de rotas provados no pacote que a possui

**What to build:** quem mexe na tabela de rotas descobre um erro de forma na hora, rodando os testes
do pacote do contrato — sem Postgres, sem subir a aplicação. Hoje a maior e mais nova parte do
contrato não tem teste nenhum no pacote dela: o que existe é um teste unitário na API que faz
monkey-patch do router do Express e um de integração que sobe a aplicação inteira. E `path` é
`string` em vez de literal, o que deixa exatamente a montagem de URL fora do alcance do compilador.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `path`, `tag` e `summary` de cada entrada são literais: os grupos passam a ser `as const`, e o
      `typecheck` do repo segue verde
- [ ] Teste no pacote do contrato que percorre a tabela uma vez e prova: todo `:param` do path tem
      chave correspondente no `params` do request
- [ ] O envelope de request só usa `body`, `params` e `query` — uma quarta chave reprova
- [ ] As tags da tabela são exatamente as declaradas no documento OpenAPI, nos dois sentidos
- [ ] A escada de views é contida (`cost` ⊇ `internal` ⊇ `public`), que é a premissa de o documento
      emitir `anyOf`
- [ ] Import entre domínios do contrato aponta para a folha, nunca para o índice — hoje há uma
      violação, que esta issue corrige
- [ ] O `exports` do manifesto do pacote concorda com o que existe no fonte
- [ ] Nenhum teste existente foi apagado; a suíte do contrato cresce
