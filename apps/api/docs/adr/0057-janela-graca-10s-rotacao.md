# A janela de graça de 10s na rotação (10.7)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Sessão e refresh*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Reapresentar um refresh já usado continua sendo roubo — mas só **fora** de uma janela de 10
segundos a partir do `usedAt`. Dentro dela, a API devolve **o mesmo par** que já emitiu naquela
rotação. O motivo é que a detecção, sozinha, punia o cliente legítimo: dois processos ou uma
requisição de prefetch apresentam o mesmo token duas vezes sem ninguém ter feito nada errado, e o
efeito era deslogar o dono de **todos** os dispositivos, sem erro visível para nenhuma das partes.
A trava em memória do cliente resolve enquanto ele for um processo só; deixa de resolver na
segunda réplica.

Três decisões sustentam isso:

**A janela é o TTL de uma chave no Redis**, não uma comparação de timestamp para decidir o que
devolver. O par emitido é gravado em `refresh:grace:{hash do token apresentado}` com `PX` de 10s
(`src/lib/refreshGrace.ts`); se a chave existe, o par é replicável, e nenhum relógio precisa
concordar com outro. Sem migration: não há "hash anterior a guardar" — cada rotação já cria uma
linha nova e marca a anterior como usada, então uma linha de `Session` é um **elo da corrente de
rotação**, não a sessão de um dispositivo. O que faltava era o **texto claro** do par, que a
requisição descartava no fim. A escrita acontece **antes** da rotação, de propósito: o par só é
servido a quem encontra a linha já marcada como usada, então gravar antes fecha a fresta em que a
segunda requisição vê `usedAt` preenchido e o cache ainda vazio. É best-effort — sua falha não
derruba a renovação.

**O `usedAt` decide qual pergunta fazer, não qual resposta dar.** Dentro da janela quem responde é
o cache; fora dela, o Redis nem é consultado e a cascata é a de sempre — uma queda do Redis não
enfraquece a detecção de roubo. E a graça só alcança um elo **por tudo o mais corriqueiro**: um
que tenha sido explicitamente morto no intervalo — logout, ban, reset de senha, a cascata de um
roubo anterior — mantém o comportamento que já tinha, porque devolver 200 ali reabriria por dez
segundos uma sessão que a API acabou de fechar.

**Dentro da janela sem par para devolver é 503, não cascata e não rotação nova.** Cascatear faria
uma falha de infraestrutura causar exatamente o dano que a janela existe para evitar; rotacionar
em modo degradado criaria um caminho que só roda durante incidente, isto é, que nunca roda de
verdade e que ninguém percebe quebrado. O 503 é a recusa explícita de decidir entre concorrência e
roubo, e é retentável. "Redis inalcançável" e "chave ausente com o Redis vivo" dão o mesmo 503 com
`reason` distinta no log: a segunda, se recorrente, é evicção por limite de memória, e o
diagnóstico é outro.

Os 10 segundos são **constante nomeada, não env var** (`REFRESH_GRACE_WINDOW_MS`): concorrência
real resolve em menos de um segundo, e 30s já seria tempo em que um token capturado de log de
proxy é usável. Número que ninguém deve ajustar em produção sem pensar não merece um botão.

**A janela devolve o par atual da corrente, não o que aquele elo emitiu (10.15).** Devolver o par
cru tinha um furo: um cliente que rotaciona A → B → C dentro dos mesmos dez segundos — e um
cliente com prefetch rotaciona assim — faria o retardatário que chega com A receber **B**, que já
está usado. O cliente voltaria um elo, perderia C, e levaria a cascata na renovação seguinte, uma
vez que a janela de B já teria passado. Ou seja: exatamente o dano que a janela existe para evitar,
por um caminho mais estreito.

A correção anda pela corrente **conferindo cada elo antes de servir**: o cache dá o caminho, o
banco dá o direito de trafegar nele. Um elo já usado manda seguir adiante; um elo invalidado,
expirado ou inexistente encerra a busca. Conferir era obrigatório por um segundo motivo, achado
na revisão: **a linha apresentada nada diz sobre a linha seguinte, que é a que se vai servir.** A
guarda de `invalidatedAt` da 10.7 olhava só o elo apresentado, e por isso um `logout` — que
invalida o elo **seguinte**, não o apresentado — deixava a janela devolver 200 e um cookie novo
para uma sessão que a API acabou de fechar. A cascata de roubo e o reset de senha escapavam por
acidente, porque tocam *todas* as linhas do usuário; o logout e o `DELETE /auth/sessions/:id`,
não.

Corrente sem ponta viva (`STALE`) **não** é 503: cai no caminho de sempre, que é o que aquela
apresentação receberia se a janela nunca tivesse existido. Falha do Redis no meio da caminhada,
ao contrário, sai como falha de infraestrutura — o invariante do módulo é que Redis fora do ar
não derruba sessão de ninguém. O teto de saltos (`REFRESH_GRACE_MAX_CHAIN_HOPS`) limita o laço e
não modela o cliente: quem passar dele cai no caminho de sempre, em vez de receber um elo gasto.

Os outros dois caminhos foram **recusados**. Não fazer nada deixaria de pé um defeito cujo sintoma
é deslogar de tudo e que ninguém consegue reproduzir. Responder 503 ao ver o elo vencido faria o
único ramo em que a promessa do 503 deste módulo — "é retentável" — seria falsa, já que a
retentativa cairia no mesmo lugar.

**Um 503 já respondido abre uma segunda janela, gravada no banco (10.18).** Depois da janela e da
corrente, sobravam dois caminhos em que a cascata disparava sem roubo. O primeiro era a
retentativa do 503 que chega **depois** de `usedAt + 10s`: a API dizia "tente de novo", o guia
dizia o mesmo, e quem obedecia tarde demais caía no ramo de roubo — o 503 prometia ser retentável
exatamente no ramo em que a promessa podia não valer. A versão realista não é evicção de chave, é
o **Redis fora do ar por mais de dez segundos**: o `rememberPair` falha em silêncio, a segunda
requisição leva 503, a retentativa também, o cliente faz backoff, e a que passa dos dez segundos
cascateia. Isso tornava falso, passados dez segundos, o invariante que a 10.7 e a 10.15
escreveram: *Redis fora do ar não derruba sessão de ninguém*.

A correção é uma marca na própria linha de `Session` (`graceDeferredAt`): no ramo de 503 —
`MISS` **ou** `UNAVAILABLE` —, antes do `throw`, o elo apresentado grava que já respondeu 503, e
a graça passa a valer também enquanto `graceDeferredAt + 30s > agora`
(`REFRESH_GRACE_DEFERRED_WINDOW_MS`, constante nomeada pelo mesmo motivo dos 10s). A marca vai no
banco, e não no Redis, porque o ramo realista é justamente aquele em que não há onde gravar. Ela
**não** abre a graça para elo explicitamente morto — a guarda de `invalidatedAt`/`expiresAt`
continua na frente, como já era com os 10s. A detecção de roubo atrasa em até 30s **só depois de
um 503**, e o 503 já é sinal de incidente.

A marca é **fixa**: só o primeiro 503 grava, e a retentativa que chega dentro dela e ainda não
acha par leva 503 de novo sem renová-la. Passados os 30s, cascata como sempre. Era a única
sub-regra que mantém a cascata como destino final de toda reapresentação sem par — só adia.
**Renovar a cada 503** criaria um ramo em que quem controla o ritmo adia a detecção
indefinidamente; **401 sem cascata** depois da marca trocaria um falso positivo por um falso
negativo silencioso, a troca que a 10.7 recusou. Dos caminhos para a marca em si, dois foram
recusados: deixar como está exigiria reescrever o invariante para ele parar de mentir, e lembrar o
incidente no Redis fecha só a variante de evicção, não a realista.

O que reduz o peso de tudo isso: o refresh token é **cookie**. Num browser, duas abas mandam A; a
primeira recebe B no cookie, a segunda leva 503 e, ao retentar, já manda B — resolve sozinho. O
caminho só morde quem guarda a **própria cópia** de A fora do cookie jar (segunda réplica de um
BFF, processo separado). A marca é rede de segurança, não caminho quente.

**O teto de saltos fica em 5, e o caminho da rajada é exposição aceita.** O segundo caminho sem
roubo é o cliente que rotaciona mais de `REFRESH_GRACE_MAX_CHAIN_HOPS` vezes dentro dos dez
segundos: o retardatário cai no caminho de sempre. Exige mais de uma rotação a cada dois
segundos, que é anomalia de cliente, e a cascata ali é resposta aceitável; subir o teto moveria a
fronteira em vez de removê-la. Para quem perguntar de novo: a fronteira de segurança é a
**janela**, não o teto — quem reapresenta dentro dos 10s já recebe a ponta viva em `hops=0` com
qualquer teto. Nenhum teto estende tempo (cada chave morre 10s depois da própria escrita), serve
elo gasto (cada elo é conferido no banco) ou permite ao atacante alongar a corrente (só rotação
legítima cria elo). O teto existe para limitar o trabalho por requisição — duas idas por salto —,
e é só isso.

O acerto de janela tem ação própria no audit log (`AUTH_REFRESH_GRACE_SERVED`), em nível
informativo; o `warn` continua reservado ao reuso fora da janela, que é o sinal mais importante do
módulo — diluir os dois faria a concorrência rotineira de um cliente enterrar o sinal. O contrato
para quem consome está em [`guides/integrating-with-the-api.md`](../guides/integrating-with-the-api.md),
com o aviso de que a janela **não** substitui serialização no cliente.

**O que a graça alcança e o que o glossário chama de sessão viva são dois conjuntos — e agora um é
construído do outro.** A guarda desta janela lê `invalidatedAt` e `expiresAt`, duas cláusulas, e não
as três de "sessão viva": o elo que ela socorre é justamente o **rotacionado**. Enquanto a
invalidação em massa esteve escrita à mão em cada site, os dois conjuntos divergiam sem que nada
percebesse — ban, deleção e reset forçado usavam as três cláusulas e deixavam o elo rotacionado sem
marca, de modo que o parágrafo acima ("um elo explicitamente morto — logout, ban, reset de senha, a
cascata de um roubo anterior — mantém o comportamento que já tinha") era verdade para o logout e
mentira para eles. O sintoma não era reabrir sessão, porque a caminhada da corrente já exige ponta
viva; era o **503**: com o Redis fora do ar, reapresentar um elo rotacionado logo depois de um ban
recebia "tente novamente agora" por uma sessão que nunca mais voltaria, e a retentativa insistia
até a marca de 30s fechar.

A correção foi dar um dono às cláusulas. `src/modules/auth/auth.liveSession.repository.ts` define
**sessão invalidável** — não morta e não expirada — e deriva **sessão viva** dela acrescentando
`usedAt` nulo, no `where` do Prisma e em memória, pelo mesmo par de funções. A guarda desta janela
e a invalidação em massa passaram a chamar a mesma função: derrubar uma sessão fecha esta porta por
construção, e não por duas condições parecidas que alguém manteve alinhadas. Ban, deleção e reset
forçado passaram a marcar também o elo rotacionado, e o único comportamento observável que mudou é
o do parágrafo acima — naquele ramo, 503 virou 401. Foi decisão do dono do projeto convergir para o
conjunto largo; o conjunto estreito tornaria o glossário literalmente verdadeiro e deixaria esta
porta aberta.
