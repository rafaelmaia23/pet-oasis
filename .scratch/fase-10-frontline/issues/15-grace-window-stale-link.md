# 15: O par cacheado que já foi rotacionado dentro da própria janela

**What to build:** uma decisão, primeiro — código depois. A janela de graça da 10.7 devolve o par
que aquela rotação emitiu. Falta dizer o que ela deve devolver quando esse par **já não é o
atual**.

O caso: o cliente apresenta A, recebe B, e rotaciona B → C ainda dentro dos 10 segundos (um
cliente que renova a cada navegação faz isso). Aí chega um retardatário com A. O cache responde,
e o cliente recebe **B**, que já foi usado. A janela de B começou a contar quando B foi usado, e a
essa altura resta pouco dela: o cliente guarda B, espera os 15 minutos do access token, renova com
B fora da janela — e leva a cascata de roubo, que é o dano exato que a 10.7 existe para evitar.

Exige as duas condições juntas (rotação dupla dentro da janela **e** um retardatário com o token
de dois elos atrás), o que não é o caso comum. Mas o cliente que dispara a rotação dupla é
justamente o cliente com prefetch, que é o público da 10.7.

**Blocked by:** None. A 10.7 está fechada e o comportamento de hoje é o que ela pediu ao pé da
letra.

**Status:** fechada em 2026-09-10

**Decisão:** decidido pelo usuário em 2026-09-10: caminho **(2)**, seguir a corrente.

## Os caminhos

1. **Não fazer nada.** O caso pede duas coincidências e a janela é de dez segundos. Ganha:
   simplicidade, nenhum código a mais no caminho quente. Perde: quando acontece, o sintoma é o
   pior possível (deslogar de tudo) e é irreproduzível para quem for depurar.
2. **Seguir a corrente.** No acerto, se o refresh do par cacheado também já foi usado, consultar
   a chave dele e devolver o par seguinte, com um teto de saltos. Ganha: o retardatário recebe o
   par **atual** e converge com o resto do cliente. Perde: um laço com teto arbitrário e uma
   segunda ida ao Redis num caminho que hoje tem uma.
3. **Recusar servir um elo vencido.** No acerto, se o refresh cacheado já foi usado, responder
   503 (o mesmo "não decido" do resto da issue). Ganha: nunca devolve token morto, e é uma
   linha. Perde: o 503 promete ser retentável e aqui a retentativa também falha — a promessa
   fica falsa nesse ramo.

**Recomendação: (2).** É a única que devolve ao cliente um par que ele pode usar, e o teto de
saltos é honesto — a corrente não pode ser mais longa que o número de rotações que cabem em dez
segundos. Mas a escolha entre "converge" e "não complica" é do dono do produto, não minha.

**Decidido: (2).**

## Critérios (depois de decidido)

- [x] O caminho escolhido está implementado e comentado com o porquê da recusa dos outros dois.
- [x] Teste na fronteira HTTP, sem injeção de relógio: A → B → C dentro da janela, e então A de
      novo. Afirma o desfecho escolhido, e afirma que **nenhuma sessão morre** no caminho.
- [x] A decisão está em `docs/context/identity-and-sessions.md`, na seção da janela de graça.

## O que foi feito

`lookupServeablePair` (`src/lib/refreshGrace.ts`) anda pela corrente e o service passou a chamá-la
em vez de `lookupPair`. A caminhada **confere cada elo antes de servir**: o cache dá o caminho, o
banco dá o direito de trafegar nele. Elo já usado manda seguir adiante; invalidado, expirado ou
inexistente encerra a busca.

A primeira versão andava só pelo cache, sem ida ao banco, com o argumento de que a existência da
chave de um token já prova que ele foi rotacionado. O argumento é verdadeiro e **insuficiente**, e
a revisão de código mostrou por quê: a linha apresentada nada diz sobre a linha **seguinte**, que
é a que se vai servir. Um `logout` invalida o elo seguinte, não o apresentado — então a guarda da
10.7 passava batido e a janela devolvia 200 mais um cookie novo para uma sessão que a API acabou
de fechar. A cascata de roubo e o reset de senha escapavam por acidente, porque tocam *todas* as
linhas do usuário; o logout e o `DELETE /auth/sessions/:id`, não. Tem teste de regressão próprio.

A conferência mora no service (`classifyGraceLink`) e entra na `lib` como parâmetro, porque a
pergunta é ao banco e só o repository fala com o Prisma. De brinde, a caminhada continua testável
sem banco.

O teto ficou em **5 saltos** (`REFRESH_GRACE_MAX_CHAIN_HOPS`) e existe para limitar o laço, não
para modelar o cliente: quem passa dele cai no caminho de sempre em vez de receber um elo gasto.

Falha do Redis **no meio** da caminhada sai como falha de infraestrutura (503), nunca como
corrente vencida: o invariante do módulo é que Redis fora do ar não derruba sessão de ninguém.

O acerto de janela passou a gravar `chainHops` na metadata do audit — `0` é o caso ordinário, e
`> 0` é a única forma de saber, em produção, se este caminho roda de verdade.

O guia de integração deixou de prometer "o mesmo par que já emitiu naquela rotação" — agora diz
que o par que volta é o **atual**, e que a retentativa do 503 é para **agora**.

Sobra registrado na issue 18 um resíduo que esta issue não fecha: os dois caminhos em que a
cascata ainda dispara sem roubo (a retentativa do 503 que chega depois de a janela fechar, e o
cliente que passa do teto de saltos).

Suíte completa (**1221**), `typecheck`, `lint` e `docs:check` verdes.
