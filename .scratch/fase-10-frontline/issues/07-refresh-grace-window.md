# 07: Janela de graça na rotação do refresh token

**What to build:** duas renovações concorrentes do mesmo cliente param de deslogar a pessoa de
todos os dispositivos. Hoje, reapresentar um refresh já usado é lido como roubo e invalida
**todas** as sessões — e um cliente com prefetch produz isso sem o usuário clicar em nada. O
front se defende com trava em memória, o que basta enquanto for um processo só; deixa de bastar
na segunda réplica ou no segundo cliente, e o modo de falha é o pior possível: deslogar o
legítimo de tudo, sem erro visível de ninguém.

Contexto que muda a proposta original do backlog: cada rotação **cria uma linha nova** e marca a
anterior como usada — uma linha é um **elo de corrente de rotação**, não a sessão de um
dispositivo. Então não há "hash anterior a guardar": ele já está lá. O que falta é o **texto
claro** do par emitido, descartado no fim da requisição.

**Blocked by:** None (can start immediately). É o item mais valioso da fase e não bloqueia nem é
bloqueado por nada — recomendado começar por ele.

**Status:** ready-for-agent

- [ ] O par emitido é cacheado no Redis com TTL igual à janela, chaveado pelo hash do token
      apresentado. Sem migration, e a janela passa a ser imposta pelo TTL da infraestrutura em
      vez de por comparação de timestamp em código, que erra sob clock skew.
- [ ] A janela é de **10 segundos**, como constante nomeada, **não** como variável de ambiente:
      concorrência real resolve em menos de um segundo, e 30s começaria a ser tempo em que um
      token capturado de log de proxy é usável. Número que ninguém deve ajustar em produção sem
      pensar não merece um botão.
- [ ] Os quatro casos do refresh se comportam assim:
      - token não usado → rotação normal; a escrita do cache é best-effort e sua falha não
        derruba a renovação;
      - usado, dentro da janela, cache responde → devolve **o mesmo par** já emitido;
      - usado, dentro da janela, cache não responde → **503**;
      - usado, fora da janela → roubo: cascata, exatamente como hoje.
- [ ] O 503 é a decisão de **não decidir**. Cascatear ali faria uma falha de infraestrutura
      deslogar o usuário de tudo — o dano que esta issue existe para evitar. Rotacionar em modo
      degradado criaria um caminho que só executa durante um incidente, ou seja, que nunca roda
      de verdade e que ninguém percebe quebrado.
- [ ] "Redis inalcançável" e "chave ausente com Redis vivo" produzem o mesmo 503, com razões
      distintas no log — a segunda, se recorrente, é evicção por limite de memória, e o
      diagnóstico é outro.
- [ ] Um acerto de janela ganha ação própria no audit log, em nível informativo. Nível de aviso
      continua reservado ao reuso fora da janela, que é o sinal mais importante do módulo.
- [ ] Testes na fronteira HTTP, **sem injeção de relógio**: a requisição é posicionada dentro ou
      fora da janela manipulando o instante de uso da linha e a chave do cache direto do teste.
      Afirmam *dentro devolve o mesmo par*, *fora derruba tudo*, e *cache sem resposta responde
      503 sem derrubar nada* — não a precisão do décimo de segundo.
- [ ] O guia de integração descreve a janela e deixa explícito que ela **não** substitui
      serialização no cliente: é rede de segurança para a corrida que sobra, não licença para
      renovar em paralelo.
