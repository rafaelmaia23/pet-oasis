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

**Status:** fechada em 2026-09-06

- [x] O par emitido é cacheado no Redis com TTL igual à janela, chaveado pelo hash do token
      apresentado. Sem migration, e a janela passa a ser imposta pelo TTL da infraestrutura em
      vez de por comparação de timestamp em código, que erra sob clock skew.
- [x] A janela é de **10 segundos**, como constante nomeada, **não** como variável de ambiente:
      concorrência real resolve em menos de um segundo, e 30s começaria a ser tempo em que um
      token capturado de log de proxy é usável. Número que ninguém deve ajustar em produção sem
      pensar não merece um botão.
- [x] Os quatro casos do refresh se comportam assim:
      - token não usado → rotação normal; a escrita do cache é best-effort e sua falha não
        derruba a renovação;
      - usado, dentro da janela, cache responde → devolve **o mesmo par** já emitido;
      - usado, dentro da janela, cache não responde → **503**;
      - usado, fora da janela → roubo: cascata, exatamente como hoje.
- [x] O 503 é a decisão de **não decidir**. Cascatear ali faria uma falha de infraestrutura
      deslogar o usuário de tudo — o dano que esta issue existe para evitar. Rotacionar em modo
      degradado criaria um caminho que só executa durante um incidente, ou seja, que nunca roda
      de verdade e que ninguém percebe quebrado.
- [x] "Redis inalcançável" e "chave ausente com Redis vivo" produzem o mesmo 503, com razões
      distintas no log — a segunda, se recorrente, é evicção por limite de memória, e o
      diagnóstico é outro.
- [x] Um acerto de janela ganha ação própria no audit log, em nível informativo. Nível de aviso
      continua reservado ao reuso fora da janela, que é o sinal mais importante do módulo.
- [x] Testes na fronteira HTTP, **sem injeção de relógio**: a requisição é posicionada dentro ou
      fora da janela manipulando o instante de uso da linha e a chave do cache direto do teste.
      Afirmam *dentro devolve o mesmo par*, *fora derruba tudo*, e *cache sem resposta responde
      503 sem derrubar nada* — não a precisão do décimo de segundo.
- [x] O guia de integração descreve a janela e deixa explícito que ela **não** substitui
      serialização no cliente: é rede de segurança para a corrida que sobra, não licença para
      renovar em paralelo.

## O que foi feito

O par emitido é gravado em `refresh:grace:{hash do token apresentado}` com `PX` de 10s
(`src/lib/refreshGrace.ts`), e a janela é esse TTL — nenhuma comparação de timestamp decide o
que devolver. Sem migration, como previsto.

Duas coisas que os critérios não nomeiam e sem as quais eles não se sustentam:

**A escrita do cache acontece antes da rotação, não depois.** O par só é servido a quem encontra
a linha já marcada como usada, então gravar antes fecha a fresta em que a segunda requisição vê
`usedAt` preenchido e o cache ainda vazio — que é exatamente a corrida que a issue existe para
socorrer. Se a rotação falhar, a chave fica órfã: ninguém a alcança, e a rotação seguinte a
sobrescreve. Continua best-effort.

**A graça só alcança um elo por tudo o mais corriqueiro.** O ramo entra antes das checagens de
`invalidatedAt`/`expiresAt`, então, sem guarda, um replay dentro de 10 segundos de um logout, de
um ban, de um reset de senha ou da cascata de um roubo anterior devolveria 200 e reabriria por
dez segundos uma sessão que a API acabou de fechar. Com a guarda, esses casos mantêm o 401 que já
tinham. Achado na revisão de código, com teste de regressão próprio.

O guia de integração já descrevia a janela e o aviso de que ela não substitui serialização no
cliente (escrito na 10.6); coube conferir e completar o contrato de máquina: `/auth/refresh` ganhou
o **503** no OpenAPI, com a descrição dos três desfechos.

Fica **aberta uma decisão de negócio** levantada pela revisão, registrada na issue 15: o que a
API deve devolver quando o par cacheado aponta para um elo que **já foi rotacionado** dentro da
mesma janela (cliente dois elos atrás). Hoje ela devolve o par como está, que é literalmente o
que esta issue pede.

Suíte completa (**1211**), `typecheck`, `lint` e `docs:check` verdes.
