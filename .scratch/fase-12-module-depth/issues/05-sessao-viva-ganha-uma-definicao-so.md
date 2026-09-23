# 05: "Sessão viva" ganha uma definição só

**What to build:** o que `GET /auth/sessions` lista passa a ser, por construção, exatamente o que
ban, reset de senha e troca de email derrubam — que é o que o glossário afirma. Hoje são duas
grafias do mesmo conjunto: cinco sites usam as três cláusulas (não usada, não invalidada, não
expirada) e três sites de invalidação omitem a primeira. A direção é benigna hoje, mas os dois
conjuntos não são o mesmo, e o próximo site de escrita é cara ou coroa.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-23

- [x] Uma definição de sessão viva exportada, composta por **toda** leitura e **toda** invalidação
- [x] Uma operação "derruba toda sessão viva deste usuário", compartilhada pelos sites de ban, reset,
      troca de email e deleção
- [x] O repositório de usuário para de soletrar colunas de sessão
- [x] Teste que exercita a definição e a invalidação diretamente, além dos fluxos que já as cobrem
      por HTTP
- [x] O teto de sessões vivas e a janela de graça da rotação continuam valendo, com os testes
      existentes verdes
- [x] O glossário do domínio aponta para a definição única, em vez de descrevê-la em prosa sozinha

## O que ficou

**A premissa da issue estava errada, e do jeito mais útil: não eram duas grafias do mesmo
conjunto, eram dois conjuntos — e o menos óbvio dos dois estava certo.** A issue supunha que a
omissão de `usedAt: null` nos sites de invalidação fosse descuido. Não era: o guard da janela de
graça é `!session.invalidatedAt`, então marcar o elo **já rotacionado** é justamente o que fecha a
porta da graça depois de um ban, um reset ou uma cascata de roubo. Dois testes de integração já
dependiam disso sem dizer — `should invalidate ALL of the user's sessions when a used refresh
token is replayed` e `should cascade as always once both the 10s window and the 503 mark are
closed (10.18)` exigem `invalidatedAt` no elo rotacionado. Uma definição única aplicada às oito
consultas, na leitura literal da issue, teria quebrado os dois.

**A decisão foi convergir para o conjunto largo**, e é do dono do projeto (consultada antes de
qualquer linha de código). Não é meio-termo: é a leitura que torna verdadeiro o que o ADR-0057 já
afirmava — "um elo explicitamente morto — logout, ban, reset de senha, a cascata de um roubo
anterior — mantém o comportamento que já tinha". Antes desta issue essa frase era verdade para o
logout e mentira para ban, deleção e reset forçado, que usavam as três cláusulas e deixavam o elo
rotacionado sem marca. Com o Redis fora do ar, reapresentar esse elo logo depois de um ban recebia
**503 "tente novamente agora"** por uma sessão que nunca mais voltaria. Agora recebe 401.

**O dono do termo é `apps/api/src/modules/auth/auth.liveSession.repository.ts`**, e ele define
dois conjuntos, um construído do outro em vez de redigitado:

- **sessão invalidável** — `invalidatedAt` nulo e `expiresAt` no futuro (`invalidatableSessionWhere`,
  `invalidatableSessionsOfUserWhere`, `isInvalidatableSession`);
- **sessão viva** — a invalidável **mais** `usedAt` nulo (`liveSessionWhere`,
  `liveSessionsOfUserWhere`, `isLiveSession`).

A composição é literal nos dois lados: `liveSessionWhere` espalha o `invalidatableSessionWhere`, e
`isLiveSession` chama `isInvalidatableSession`. Não há como um dos dois mudar sem o outro. Os
construtores de `where` carregam `satisfies Prisma.SessionWhereInput`, que é o que faz uma coluna
renomeada no schema virar erro de compilação — sem ele não viraria, porque tipo nomeado não sofre
checagem de propriedade excedente no `where` que o recebe.

E uma operação, `invalidateSessionsOfUser(client, userId, at)`. O `at` é **obrigatório** porque
quase todo chamador roda dentro de uma transação com um `new Date()` só propagado pela cadeia
(regra de `user.lifecycle.repository.ts`); ele é o corte do prazo **e** a marca gravada. Quem lê
pode omitir o instante — uma leitura não precisa concordar com nenhum outro evento. O cliente do
Prisma chega por parâmetro: o módulo nunca vai buscá-lo, e por isso continua sendo o repository
quem fala com o banco. O sufixo `.repository.ts` está ali por isso, e não por decoração.

**Nove sites viraram seis chamadas e nenhuma coluna soletrada.** Em `auth.repository.ts`: o teto
de sessões e a listagem usam `liveSessionsOfUserWhere`; `invalidateAllUserSessions` (a cascata de
roubo), `consumePasswordReset` e `updatePasswordAndInvalidateSessions` delegam a operação. Em
`user.repository.ts`, os três blocos de sete linhas de ban, deleção e reset forçado viraram uma
linha cada — o repositório de usuário não menciona mais nenhuma coluna de `Session`. Restam no app
dois `usedAt: null` fora do módulo, ambos de `VerificationToken` (território da issue 06), e o
predicado de **retenção** de `src/scripts/cleanup-sessions.ts`, que é "morto há mais de N dias" e
não vivacidade.

**Duas grafias em memória também sumiram.** `revokeSession` buscava a sessão por id e conferia a
vivacidade depois; como os dois desfechos são o mesmo 404 — revogar uma sessão morta não é caso
distinto de revogar uma que não existe —, a vivacidade virou cláusula da busca
(`findLiveSessionByIdForUser`). E o `graceApplies` do `refresh`, que soletrava `!invalidatedAt &&
expiresAt > now`, passou a chamar `isInvalidatableSession`: a guarda da graça e a invalidação em
massa são agora a **mesma função**, que é o que faz "derrubar fecha a porta da graça" valer por
construção e não por duas condições parecidas mantidas alinhadas à mão. `classifyGraceLink` também
decide os três estados pelos predicados, o que de quebra alinhou a fronteira do prazo: o corte é
`expiresAt > agora` nos três lugares, como o `gt` do banco.

**Os testes.** `tests/unit/modules/auth/auth.liveSession.test.ts` prova as partes puras: as
cláusulas exatas de cada filtro, que a viva é a invalidável mais `usedAt` nulo, que os dois
predicados concordam com os `where` coluna a coluna, e a fronteira `gt` (uma sessão que expira
*exatamente agora* não é nem viva nem invalidável). `tests/integration/modules/auth/auth.liveSession.test.ts`
dirige filtro e invalidação contra o banco: a listagem separa a viva das três que não são; a
invalidação mata a viva e o elo rotacionado, não remarca a já morta (a primeira morte é a que
vale), deixa a expirada em paz, não encosta em outro usuário, desfaz junto com a transação que a
contém — e, numa tabela, que os quatro sites de escrita (ban, deleção, reset forçado, troca de
senha) não deixam elo rotacionado de pé. Uma mutação de controle (devolver o filtro estreito na
invalidação) derruba cinco testes: os três novos e os dois de integração que já guardavam a
invariante sem dizer.

**Onde a decisão passou a morar.** O ADR `apps/api/docs/adr/0057-janela-graca-10s-rotacao.md`
ganhou o lado que faltava — por que os dois conjuntos existem, o que era mentira antes, e o que
mudou de observável. É o que a spec previa ao dizer que sessão viva "completa ou reforça decisões
já registradas" em vez de pedir ADR novo. O glossário (`apps/api/CONTEXT.md`) passou a ter os
**dois** termos, cada um em uma linha de definição, apontando para o módulo e para o ADR.

**Um achado que não é meu para resolver, e por isso foi para o backlog.** A issue nomeia quatro
sites: ban, reset, **troca de email** e deleção. O site de troca de email não existe —
`consumeEmailChange` não toca em `Session`, nem antes nem depois desta issue; o quarto site real é
a **troca de senha**. Se trocar o email deveria derrubar sessão é regra de negócio (o email é o
identificador de login), então virou item em `docs/reference/backlog.md` com os dois argumentos e
o tamanho, em vez de decisão minha de passagem.

**Comportamento externo:** idêntico em todo caminho que a suíte cobre — 1417 testes da API em 82
arquivos, verdes, sem edição de nenhum teste existente. A única mudança observável é a de corner
acima (503 → 401 depois de ban/deleção/reset forçado, com o Redis fora do ar), que é o ponto da
decisão.
