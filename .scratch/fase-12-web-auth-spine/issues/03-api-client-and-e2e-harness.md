# 03: Alcançar a API real, com o contrato e prova ponta a ponta

**What to build:** a aplicação fala com a API de verdade e mostra dado real numa página. E
existe a infraestrutura de teste que prova isso automaticamente, contra a API subida pelo
stack de teste do monorepo.

Este é o tracer bullet da comunicação: atravessa configuração de ambiente, cliente HTTP,
contrato compartilhado, renderização no servidor e teste ponta a ponta — usando um endpoint
público, sem envolver autenticação.

**Blocked by:** 00, 01

**Status:** ready-for-agent

- [x] `@pet-oasis/api-contracts` nas dependências por `workspace:*`; o Next o transpila
      (`transpilePackages`). Nenhum tipo é gerado do OpenAPI e nenhum `.d.ts` é commitado.
      **Feito na 11.12** (`.scratch/fase-11-monorepo/issues/12-web-consumes-contracts.md`) —
      não refazer
- [ ] Cliente HTTP único e tipado (`apiFetch`), ponto exclusivo de contato com a API, tipado
      pela **tabela de rotas do contrato**: nenhum path é escrito à mão no web. Ele **toma o
      lugar** de `apps/web/src/lib/api-contract.ts`, o módulo de prova que a 11.12 deixou: as
      três pontas que ele amarra (schema de request, view de resposta, tabela de rotas) passam
      a ser amarradas pelo `apiFetch`, e o módulo sai no mesmo commit
- [ ] Prova negativa, feita e desfeita no mesmo PR: mudar um campo de uma view no contrato
      faz o `typecheck` do web falhar. A 11.12 já a fez nas três pontas, mas **contra o
      módulo de prova que o `apiFetch` substitui** — então ela se refaz aqui, contra o
      cliente de verdade. Fica desmarcada de propósito: é trabalho desta issue
- [ ] O `next build` prova o contrato no **bundle**, não só no `tsc`: com o `apiFetch` sendo
      importado por um Server Component, o pacote entra no bundle de servidor. A 11.12 mediu
      isso com uma página descartável e não deixou nada importando o contrato no estado
      commitado (ela não constrói tela) — aqui o import é de verdade e a prova fica de pé
- [ ] O cliente resolve o endereço por ambiente: **rede interna do Docker**
      (`http://api:3000/api/v1`) nas chamadas do servidor; endereço público apenas para URL
      de imagem
- [ ] O cliente repassa o IP do visitante no cabeçalho de encaminhamento em **toda chamada
      feita em nome de um visitante**, e **não** o repassa nas que não são (job, health check).
      A API confia por endereço de origem, não por contagem de saltos: copiar o cabeçalho
      recebido ou acrescentar o próprio salto dá no mesmo
- [ ] O cliente converte o envelope de erro da API numa forma única que a interface consome,
      ramificando por `code` (`ERROR_CODES` do contrato) e lendo o `Retry-After` do 429
- [ ] A conversão do envelope de erro é testada como função pura
- [ ] Um Server Component exibe dado real vindo de um endpoint público da API
- [ ] Playwright configurado para subir a API pelo stack de teste da raiz do monorepo e
      **derrubar ao final, inclusive em caso de falha**
- [ ] Um teste ponta a ponta prova que a página renderiza o dado real
- [ ] Vitest configurado para os testes de costura e de função pura
