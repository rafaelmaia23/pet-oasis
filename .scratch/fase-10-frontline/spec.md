# Fase 10 — Desbloqueio do front web e dívida de deploy

Triagem: ready-for-agent

> Nenhum domínio novo. Tudo aqui existe porque o `pet-oasis-web` precisa, ou porque a
> produção já cobrou. Decisões fechadas em quatro rodadas de grelha; a errata para o outro
> repo está ao lado, em `errata-pet-oasis-web.md`.

---

## Problem Statement

O front web nasceu e a API não estava pronta para ter um cliente. Três classes de problema
apareceram ao mesmo tempo:

**A API não consegue ser consumida corretamente.** As três recusas de login que o front precisa
distinguir — banida, senha forçada, não verificada — respondem 403 com o mesmo `code:
"FORBIDDEN"`, diferindo só na prosa em pt-BR. Cumprir a promessa de "mensagem por condição"
exigiria casar string em português. Some-se que o front documentou essas recusas como 401, e a
tabela de erro dele manda 403 virar toast de erro de programação: a tela de login mostraria o
diagnóstico errado exatamente quando a pessoa mais precisa da instrução certa.

**A API não consegue ser alcançada corretamente.** O front chama `http://api:3000`; o serviço no
Compose se chama `app`, então o DNS publica `app` e a chamada falharia em resolução no primeiro
deploy conjunto. E com o front renderizando no servidor, quem abre a conexão é o container dele:
todos os visitantes colapsam num IP só, dividem o mesmo balde de rate limit, e o audit log passa
a gravar o IP errado em toda linha. Não é bug de nenhum dos dois lados — limitar por IP está
certo para quem fala direto com a API, e SSR é o que quebra a premissa "um IP ≈ um visitante".

**A detecção de roubo de refresh token castiga o cliente legítimo.** Reapresentar um refresh já
usado invalida *todas* as sessões do usuário. Um cliente que renove de forma concorrente — dois
processos, uma requisição de prefetch — produz isso sem o usuário clicar em nada, e o modo de
falha é o pior possível: deslogar o dono de todos os dispositivos, sem erro visível de ninguém.
O front se defende com single-flight em memória, e isso basta **enquanto for um processo Node
só**; deixa de bastar na segunda réplica ou no segundo cliente.

Em paralelo, a dívida de deploy: o seed é fatal no boot e já pôs a API inteira fora do ar por
causa de dado de demonstração; o diretório de uploads vive dentro do working tree do repo
clonado, com dois donos incompatíveis (uid do git e uid do container) e dois incidentes no
histórico; e o Prisma emite warning de OpenSSL a cada boot, escolhendo engine implicitamente.

---

## Solution

A API decide como se fala com ela, documenta, e os clientes respeitam. Concretamente:

1. **Um `code` estável por condição de recusa**, para o cliente ramificar por máquina e não por
   prosa. Os status ficam como estão: 403 é correto quando a senha já conferiu e é a *conta* que
   está recusada.
2. **Uma topologia de rede declarada**, com o serviço chamado pelo nome certo (`api`), três
   redes com papéis distintos, e a porta 3000 deixando de ser publicada na internet.
3. **Confiança em `X-Forwarded-For` por endereço de origem**, não por contagem de saltos — o que
   acerta as duas cadeias que passam a coexistir sem obrigar nenhum cliente a acertar o formato
   do header.
4. **Uma janela de graça de 10 segundos** no refresh, devolvendo o mesmo par já emitido, sem
   enfraquecer a detecção: reuso fora da janela continua sendo roubo e continua derrubando tudo.
5. **A dívida de deploy paga**, e o polimento de segurança barato que ficou mais relevante agora
   que existe formulário real postando na API.
6. **Um guia permanente de integração**, para que o próximo cliente (o app mobile) não precise
   descobrir nada disso lendo código.

---

## User Stories

**Consumir a API corretamente**

1. Como front web, quero que cada recusa de login carregue um `code` estável, para ramificar por
   máquina em vez de casar prosa em português que pode ser reescrita a qualquer momento.
2. Como pessoa com conta não verificada, quero que a tela de login me diga para verificar meu
   email, em vez de exibir um erro genérico de permissão.
3. Como pessoa com conta banida, quero uma mensagem que me diga o que fazer, distinta da de
   credencial errada.
4. Como pessoa com troca de senha forçada pelo admin, quero ser mandada ao fluxo de redefinição
   e não ficar presa num erro sem saída.
5. Como pessoa que errou a senha, quero continuar sem saber se o email existe, porque a
   indistinção entre "email desconhecido" e "senha errada" é proteção minha.
6. Como front web, quero que um 429 traga `Retry-After`, para mostrar o tempo de espera real em
   vez de uma mensagem genérica.
7. Como desenvolvedor de um cliente novo, quero um guia único que diga como alcançar a API, o
   que ela espera e o que ela devolve, para não ter que inferir do código.
8. Como app mobile futuro, quero que o guia me diga onde CORS **não** se aplica, para não pedir
   uma permissão que meu cliente nunca vai usar.

**Alcançar a API corretamente**

9. Como front web, quero resolver a API por um nome de host que existe, para o primeiro deploy
   conjunto não falhar em DNS.
10. Como operador, quero as redes declaradas no compose, para não precisar rodar
    `docker network connect` à mão a cada deploy.
11. Como operador, quero que Postgres e Redis fiquem numa rede sem rota para a internet e
    inalcançável pelo front, para que um cliente comprometido não alcance o banco.
12. Como operador, quero que a porta da API deixe de ser publicada na internet, para que
    ninguém forje o próprio IP e envenene rate limit, lockout e audit log.
13. Como visitante da vitrine, quero que meu rate limit seja meu, e não dividido com todos os
    outros visitantes que chegaram pelo mesmo container de front.
14. Como front web, quero repassar o IP do visitante sem precisar saber se devo copiar ou
    acrescentar ao header, porque errar isso é silencioso.
15. Como auditor, quero que o audit log grave o IP do visitante e não o do container, senão a
    trilha inteira registra o mesmo endereço.
16. Como cliente que fala direto com a API (Bruno, Scalar, app mobile), quero que a resolução de
    IP continue certa para mim, apesar de a cadeia do front ter um salto a mais.
17. Como operador, quero que os três systemd timers sobrevivam ao rename do container, com um
    procedimento escrito de remover os antigos e instalar os novos.

**Sessão que não me desloga sem motivo**

18. Como pessoa logada, quero que duas renovações concorrentes do meu cliente não me desloguem
    de todos os dispositivos, porque eu não fiz nada.
19. Como front web, quero receber de volta *o mesmo par* que a API já emitiu naquela rotação, e
    não um par novo, para que o processo concorrente não fique com um token morto.
20. Como dono da conta, quero que reuso de token **fora** da janela continue derrubando tudo,
    porque essa cascata é o que dá valor à detecção.
21. Como front web, quero que um 503 no `/auth/refresh` seja retentável e não destrua nada, para
    tratar uma indisponibilidade momentânea sem deslogar ninguém.
22. Como operador, quero que um acerto de janela apareça no audit log, para responder depois se
    ela está sendo usada por concorrência legítima ou mascarando um problema.
23. Como desenvolvedor de interface, quero saber que o `id` de uma sessão muda a cada renovação,
    para não construir uma tela de dispositivos que mira um alvo que já não existe.

**Migração de domínio**

24. Como visitante, quero que o apex sirva a loja, porque é a peça que tem valor de vitrine.
25. Como quem seguiu um link publicado do apex para a documentação, quero um 301 para o
    subdomínio, porque link publicado não deve morrer.
26. Como pessoa criando conta, quero que o link de verificação do meu email aponte para uma
    página que existe, e não para um 404.
27. Como operador, quero que a virada de `APP_URL` só aconteça depois de o front ter as quatro
    rotas no ar, porque virar antes trava toda conta nova.
28. Como operador, quero que a troca de domínio das imagens não exija migration, porque o banco
    guarda a chave e nunca a URL.

**Dívida de deploy**

29. Como operador, quero que uma falha ao semear dado de demonstração não derrube a API inteira,
    porque dado de demo não é motivo para 502 no proxy.
30. Como operador, quero fazer `git pull` sem que ele aborte por permissão num diretório de
    dados, deixando o checkout pela metade.
31. Como operador, quero que os arquivos enviados sobrevivam a um `git clean -fd`.
32. Como operador, quero o boot sem warning de OpenSSL, para que a engine do Prisma seja escolha
    explícita e não default silencioso — o que é frágil em ARM64 e em bump de imagem base.

**Endurecimento barato**

33. Como pessoa com conta, quero que um email inexistente e uma senha errada demorem o mesmo
    tanto, senão a diferença de tempo vira oráculo de existência de conta.
34. Como operador, quero limite de comprimento em todo campo de texto, senão 99KB cabem num
    campo `name` e viram lixo no banco, índice inchado e linha de log gigante.
35. Como operador, quero garantia de que nenhum schema de update aceita `status`, `roleId`,
    `bannedAt` ou `mustChangePassword` vindos do corpo.
36. Como operador, quero o algoritmo do JWT fixado e `iss`/`aud` validados, porque não pinar
    deixa o token exposto a *algorithm confusion*.

---

## Implementation Decisions

### Erro e contrato

- **`code` passa a ser parametrizável nas factories de erro.** Hoje o tipo utilitário que as
  factories usam remove `code` dos parâmetros, fixando-o por subclasse — é por isso que as três
  recusas carregam `FORBIDDEN` idêntico. Relaxar isso é o que destrava a ramificação por
  máquina, e é a única mudança estrutural do módulo de erro.
- **Os status não mudam.** 403 é semanticamente correto nas três recusas de login: a senha já
  conferiu, então a pessoa está autenticada e a *conta* é que está recusada. Mudar para 401
  seria quebra de contrato num endpoint já documentado no `endpoints.md`, no OpenAPI e na coleção
  Bruno, em troca de nada.
- **Os `code`s de login:** `ACCOUNT_BANNED`, `PASSWORD_RESET_REQUIRED`, `EMAIL_NOT_VERIFIED`. As
  três só disparam depois de a senha conferir — quem as recebe é o dono da conta, então não há
  vazamento novo em ramificar por elas. Credencial errada e email desconhecido continuam
  deliberadamente indistinguíveis entre si.
- **A ordem de avaliação não muda:** lockout (429) → banida → senha forçada → não verificada.

### Rede e identidade do serviço

- **O serviço do Compose é renomeado de `app` para `api`**, e o container de `pet-oasis-app` para
  `pet-oasis-api`. O nome do serviço vira alias de rede automático, então o front resolve `api`
  sem mudar nada — o ADR-0004 dele, que já dizia `http://api:3000`, passa a estar correto por
  correção nossa. Um alias explícito é declarado mesmo assim, porque DNS que falha em silêncio é
  o modo de falha caro aqui.
- **Não se renomeia** o `WORKDIR` nem os caminhos internos do container, que são sistema de
  arquivos e não serviço; nem a env var que guarda a URL pública do cliente, que sempre quis
  dizer "o app que a pessoa vê" e agora finalmente quer dizer isso.
- **Três redes, com papéis distintos:** uma `internal: true` com banco, cache e API — sem rota
  para a internet e inalcançável de fora; uma nomeada e dedicada, compartilhada com clientes
  internos; e a rede externa do reverse proxy, declarada em vez de conectada à mão. Um cliente na
  rede compartilhada não alcança Postgres nem Redis, de propósito.
- **A porta da API deixa de ser publicada no host.** O nginx alcança por DNS de container na rede
  do proxy, então a publicação não tinha mais função — e sua remoção é o que torna seguro confiar
  em endereço privado. A env var da porta some da produção e sobrevive só em dev.
- **Os três systemd units** trazem o nome do container gravado, então o rename os quebra até
  serem reinstalados. O procedimento de remover os antigos e instalar os novos é escrito junto,
  com a ordem (reinstalar **antes** do deploy que renomeia) e uma execução manual de verificação
  que não é opcional — unit apontando para container inexistente falha sem acordar ninguém.

### `X-Forwarded-For`

- **A confiança passa a ser por endereço de origem, não por contagem de saltos.** A proposta
  original do backlog (confiar em dois saltos) está errada aqui: duas cadeias passam a coexistir
  — visitante → proxy → API, com um salto, e visitante → proxy → front → API, com dois — e
  nenhuma contagem única serve as duas. Confiar em loopback mais o espaço de endereço privado faz
  o framework caminhar o header da direita para a esquerda pulando os confiáveis e parar no
  primeiro que não é, o que acerta ambas.
- **Consequência de contrato:** o cliente pode copiar o header recebido ou acrescentar o próprio
  salto, tanto faz. Isso é deliberado: transformar um detalhe de implementação do cliente em
  pré-requisito de segurança da API é o acoplamento que este item existe para evitar.
- **O que torna isso seguro é a porta não publicada.** Com ela publicada, confiar em endereço
  privado seria um furo; sem ela, uma conexão forjada da internet não existe. As duas issues são
  uma decisão só, e a ordem entre elas importa.
- **Chamada que não é em nome de um visitante** não manda o header, e aí o IP registrado é o do
  próprio cliente — que é o correto.

### Janela de graça no refresh

- **Uma linha de sessão é um elo de corrente de rotação, não a sessão de um dispositivo.** Cada
  rotação cria uma linha nova e marca a anterior como usada. Isso significa que a proposta do
  backlog — "guardar o hash anterior" — descreve um modelo que não é o nosso: o hash anterior já
  está lá, numa linha própria. O que falta não é o hash, é o **texto claro** do par emitido, que
  é descartado no fim da requisição.
- **O par emitido é cacheado no Redis com TTL igual à janela**, chaveado pelo hash do token
  apresentado. Não exige migration, e a janela passa a ser imposta pelo TTL da infraestrutura em
  vez de por comparação de timestamp em código, que erra sob clock skew.
- **Rejeitadas, e por quê:** guardar o par em coluna da sessão persistiria segredo em backup e em
  dump; rotacionar de novo em vez de devolver o mesmo par não resolve a corrida, só a empurra
  para fora da janela, onde ela volta a ser lida como roubo, e ainda queima um elo por replay.
- **A janela é de 10 segundos**, como constante nomeada e não como env var: concorrência real
  resolve em menos de um segundo, 10s já é uma ordem de grandeza de folga, e 30s começaria a ser
  tempo em que um token capturado de log de proxy é usável. Número que ninguém deve ajustar em
  produção sem pensar não merece um botão.
- **Os quatro casos do refresh:** token não usado → rotação normal, com a escrita do cache sendo
  best-effort; usado, dentro da janela pelo `usedAt`, com o cache respondendo → devolve o par
  cacheado; usado, dentro da janela, cache sem resposta → **503**; usado, fora da janela → roubo,
  cascata como hoje.
- **O 503 é a decisão de não decidir.** Cascatear ali faria uma falha de infraestrutura deslogar
  o usuário de tudo, que é o dano que esta fase existe para evitar; e rotacionar em modo degradado
  criaria um caminho de código que só executa durante um incidente — ou seja, um caminho que
  nunca roda de verdade e que ninguém percebe quebrado. O 503 não destrói nada, é retentável, e
  degrada exatamente uma coisa: refresh concorrente enquanto o cache está fora.
- **"Redis inalcançável" e "chave ausente com Redis vivo"** produzem o mesmo 503 com razões
  distintas no log. A segunda, se recorrente, é evicção por limite de memória, e o diagnóstico é
  outro.
- **Um acerto de janela ganha ação própria no audit log**, em nível informativo. A taxonomia é
  união fechada em tempo de compilação, então acrescentar obriga a tratá-la. Nível de aviso
  continua reservado ao reuso fora da janela, que é o sinal mais importante do módulo.
- **A ambiguidade do termo "sessão" é registrada** no arquivo temático de contexto e na errata do
  front, sem renomear o modelo. Renomear reabriria o teto de sessões vivas, a evicção, o script de
  limpeza e o contrato de exclusão por id — desproporcional. Mas deixar sem registro convida o
  front a construir uma tela que guarda um id que muda a cada 15 minutos.

### CORS

- **A URL pública do cliente sai da allowlist derivada.** Depois da migração ela passa a ser o
  front, e o front não chama por navegador — a entrada viraria origem permitida sem consumidor.
  O middleware e a env var explícita ficam, para o dia em que existir um cliente de navegador de
  outra origem.
- **App mobile nativo não é motivo para manter CORS** e não entra na allowlist: não há navegador,
  não há `Origin`, não há preflight.

### Migração de domínio

- A ordem é obrigatória e faz parte do item: subdomínio, certificado e os 301 **primeiro**; a
  virada da URL pública do cliente **só** depois de o front ter as quatro rotas de email no ar.
  Virar antes transforma verificação de conta e reset de senha em 404 — justamente os fluxos que
  travam conta nova.
- A issue da virada fica **na fase**, bloqueada e explícita, com aresta que cruza para o outro
  repo. Deixá-la fora órfã um passo operacional, e passo sem dono é passo que ninguém executa.
- **Sem migration para as imagens:** o banco guarda a chave do arquivo, nunca a URL. Trocar a env
  var basta. **Sem mudança na especificação:** o campo de servidores é relativo e segue o host que
  serve o documento.

### Dívida de deploy

- **O seed sai do caminho crítico do boot** — passo one-shot ou serviço dedicado que não
  reinicia. Se permanecer no entrypoint, torna-se fail-open: loga em erro e segue para o start do
  servidor. Tratar falha de dado de demonstração como fatal contraria a degradação já adotada para
  os destinos externos de observabilidade.
- **O diretório de dados sai do working tree** e entra por bind mount declarado, com o uid
  esperado documentado no guia de deploy — ou fixado no serviço, para não depender do usuário da
  imagem base.
- **OpenSSL é instalado no estágio de runtime**, tornando a engine do Prisma escolha explícita.

### Endurecimento

- **Timing attack:** o caminho de email desconhecido passa a verificar contra um hash dummy fixo,
  igualando o tempo dos dois caminhos.
- **Comprimento máximo** coerente com a coluna correspondente, em todo campo de texto dos schemas.
- **Mass assignment:** se o comportamento padrão do validador já rejeita chaves desconhecidas, o
  item vira teste de regressão explícito — que vale ter, porque é o tipo de proteção que se perde
  em silêncio num refactor.
- **JWT:** algoritmo fixado, emissor e audiência validados, tolerância de desvio de relógio
  definida.

### Ordem e arestas

Duas trilhas de arquivos disjuntos, que podem intercalar sem conflito.

**Trilha infra** — sequencial, todas tocam os mesmos arquivos de infraestrutura:
rename → redes e confiança de IP → seed fail-open → diretório de dados → OpenSSL → subdomínio e
redirects → virada da URL pública *(bloqueada pela anterior **e** pelo front)*.

**Trilha aplicação** — independente da infra:
janela de graça → `code`s de login → timing attack → JWT → CORS → mass assignment → comprimento
máximo *(varredura larga, por último de propósito, para não conflitar com a issue dos `code`s)*.

A janela de graça vem primeiro porque é o único item da fase que resolve um modo de falha que
desloga o usuário de todos os dispositivos, e porque não bloqueia nem é bloqueada por nada.

---

## Testing Decisions

**O que faz um bom teste aqui:** afirma comportamento externo observável, nunca estrutura
interna. Um teste que soubesse que a janela de graça usa Redis, ou que o `code` vem de um campo
da classe de erro, quebraria num refactor que não muda nada para quem consome.

**Duas costuras, e nenhuma nova.**

1. **A fronteira HTTP.** Supertest contra a app real, Postgres real e Redis real. Nada é
   falsificado. É onde vivem a esmagadora maioria dos testes do projeto, e onde entram: os `code`s
   de login, a janela de graça, a resolução de IP, CORS, comprimento máximo, mass assignment e
   JWT. Prior art: os arquivos de integração por módulo, com o de autenticação já mandando
   `X-Forwarded-For` por Supertest para exercitar rate limit — a costura de que a issue de IP
   precisa já existe e já é usada.
2. **Função pura, testada direto.** Sem dependência a substituir, então não é bem uma costura.
   Prior art: a transição pura do lockout. Entra aqui a lógica de decisão da janela, se ela sair
   como função pura dos quatro casos.

**Decisões específicas:**

- **A janela de graça não ganha injeção de relógio.** O teste posiciona a requisição dentro ou
  fora da janela manipulando o `usedAt` da linha e a chave do cache direto do teste — ambos já
  alcançáveis na costura 1. Injetar um relógio seria uma terceira coisa falsificada para provar
  um número que não é comportamento observável. O que se afirma é *dentro da janela devolve o
  mesmo par*, *fora da janela derruba tudo*, e *cache sem resposta responde 503 sem derrubar
  nada* — não a precisão do décimo segundo.
- **O observável da resolução de IP é o endereço que a API já grava** na linha de sessão e no
  audit log. Nenhuma rota de eco é criada só para o teste. Os três caminhos exigidos pelo item —
  direto, via proxy, via cliente com salto extra — são três requisições com formatos diferentes
  do header.
- **O timing attack é o único item cujo teste é chamada de julgamento.** Asserção de tempo é
  flaky por natureza. A proposta é um limite estatístico largo na costura 1 (medianas de N
  tentativas de email desconhecido e de senha errada dentro de uma razão generosa). Se der flake,
  o teste vira medição manual documentada — **não** vira retry, que só esconderia o flake.
- **Cinco issues não têm teste automatizado**, e isso é declarado em vez de contornado: rename de
  container, topologia de rede, seed no boot, diretório de dados e OpenSSL vivem no Docker, e a
  única forma de exercitá-las na costura 1 seria falsificar o Docker — uma mentira a manter, e
  mentira desatualizada deixa o teste passando com a coisa quebrada. O critério de aceite delas é
  verificação manual documentada, com o comando e a saída esperada escritos na issue.
- **A varredura de comprimento máximo** produz um teste por schema tocado, afirmando que o campo
  acima do limite é recusado com o erro de validação por campo — não um teste-monolito.

---

## Out of Scope

- **Carrinho, pedido e pagamento.** São a Fase 11. Nada de domínio novo entra aqui.
- **Renomear o modelo de sessão** para refletir que uma linha é um elo de corrente. Reabriria o
  teto de sessões vivas, a evicção, o script de limpeza e o contrato de exclusão por id. A
  ambiguidade é **registrada**, não corrigida.
- **Enfraquecer a cascata de detecção de roubo** para invalidar só a sessão envolvida. A cascata é
  o que dá valor à detecção; a janela resolve a concorrência sem tocar nela.
- **Separar readiness de status.** Só ganha sentido com mais de uma réplica, e a dependência entre
  projetos de compose distintos não usa healthcheck.
- **Busca textual nas demais listagens do catálogo.** O gatilho escrito é alguém precisar filtrar
  por texto na interface, e o front ainda está na fundação e autenticação.
- **O atalho de conveniência para os pets do próprio dono.** A rota aninhada já é alcançável desde
  que o identificador do perfil de cliente passou a aparecer na resposta de identidade.
- **Bloqueio de senhas vazadas, CI de cadeia de suprimentos, backup do banco, tracing.** Bons,
  nenhum desbloqueia o front, e cada um puxa a fase para longe do propósito dela.
- **Movimentação de estoque.** É da Fase 11 por definição — é onde a movimentação passa a ter
  causa.
- **Corrigir a documentação do outro repo.** Os achados estão na errata ao lado; aplicá-los é
  trabalho de lá.

---

## Further Notes

- **A migração de token para cookie foi resolvida fora deste repo** e a entrada de backlog
  correspondente já foi encerrada. O gatilho documentado ocorreu — o frontend próprio nasceu — e
  a resposta veio do BFF do outro lado, sem que a API trocasse de mecanismo. É isso que a mantém
  universal para o app mobile planejado, que não usaria cookie.
- **O guia permanente de integração já existe** e descreve o estado-alvo desta fase, com um aviso
  no topo dizendo isso. O aviso sai no fecho.
- **A errata do outro repo tem sete itens**, e um deles é boa notícia: o host interno que o ADR-0004
  deles declara estava errado quando foi escrito e passa a estar certo — a API é que veio ao
  encontro dele, e o ADR não precisa de correção.
- **Duas premissas do backlog foram corrigidas nesta grelha** e as entradas de lá devem ser
  atualizadas no fecho: confiar em dois saltos (não serve às duas cadeias) e guardar o hash
  anterior na sessão (descreve um modelo que não é o nosso).
- **O escopo cresceu de 11 para 14 itens** durante a grelha, ao separar o rename e o ajuste de
  CORS em issues próprias e ao acrescentar os `code`s de login, que não existiam em nenhum
  levantamento — nasceram de ler os dois repositórios lado a lado.
