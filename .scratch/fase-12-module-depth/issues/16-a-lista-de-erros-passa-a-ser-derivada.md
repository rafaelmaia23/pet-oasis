# 16: A lista de erros passa a ser derivada, e o documento não pode sub-declarar

**What to build:** quem lê o `/openapi.json` passa a ver os status que a API de fato responde. Hoje
não vê: catorze rotas com parâmetro respondem 422 a um id inválido e não declaram esse 422 — e a
própria suíte de integração exige o 422 em algumas delas. A prova de que a lista é mantida à mão está
em duas rotas do mesmo path, uma declarando o 422 e a outra não.

Esta é a **única mudança visível para fora** de todo o esforço, e por isso fica num commit próprio e
anunciado: nenhum comportamento muda, apenas a documentação passa a dizer a verdade.

**Blocked by:** 15 (o guard só vale para as 79 rotas quando todas estiverem sob o registrador).

**Status:** ready-for-agent

- [ ] A lista de erros de uma rota é **derivada** do que o schema de request e os middlewares podem
      produzir, em vez de escrita à mão em cada entrada
- [ ] Um teste proíbe o documento de sub-declarar um status alcançável
- [ ] As catorze rotas que omitiam o 422 passam a declará-lo
- [ ] Todas as rotas autenticadas continuam declarando o 401 (hoje as 63 declaram — isto não regride)
- [ ] A mudança do documento fica **num commit só**, com a mensagem dizendo o que um consumidor
      (coleção Bruno, cliente gerado) vai ver de diferente
- [ ] Nenhum status muda de comportamento: o que a API responde hoje, responde igual depois
