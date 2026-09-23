# 05: "Sessão viva" ganha uma definição só

**What to build:** o que `GET /auth/sessions` lista passa a ser, por construção, exatamente o que
ban, reset de senha e troca de email derrubam — que é o que o glossário afirma. Hoje são duas
grafias do mesmo conjunto: cinco sites usam as três cláusulas (não usada, não invalidada, não
expirada) e três sites de invalidação omitem a primeira. A direção é benigna hoje, mas os dois
conjuntos não são o mesmo, e o próximo site de escrita é cara ou coroa.

**Blocked by:** None (can start immediately).

**Status:** done

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

**Os dois conjuntos não eram duas grafias do mesmo conjunto — eram dois conjuntos, e um deles
estava certo por um motivo que ninguém tinha escrito.** A issue supunha que a omissão de `usedAt:
null` nos três sites de invalidação fosse descuido. Não era, ou pelo menos não é mais: o guard da
janela de graça é `!session.invalidatedAt` (`auth.service.ts`), então marcar o elo **já
rotacionado** é justamente o que fecha a porta da graça depois de um ban, um reset ou uma cascata
de roubo. Dois testes de integração já dependiam disso sem dizer — `should invalidate ALL of the
user's sessions when a used refresh token is replayed` e `should cascade as always once both the
10s window and the 503 mark are closed (10.18)` exigem `invalidatedAt` no elo rotacionado. Uma
definição única aplicada às oito consultas, na leitura literal da issue, teria quebrado os dois.

**A decisão foi convergir para o conjunto largo**, e ela é do dono do projeto (consultada antes de
qualquer código). Não é o meio-termo: é a leitura que torna verdadeiro o comentário que o
`auth.service.ts` já fazia — "um elo que foi **explicitamente morto** — logout, ban, reset de
senha, ou a cascata de um roubo anterior — cai no caminho de sempre". Antes desta issue esse
comentário era falso para ban, deleção e reset forçado: os três usavam as três cláusulas e
deixavam o elo rotacionado sem marca. Com o Redis fora do ar, um replay desse elo dentro da janela
recebia **503 "tente novamente agora"** para uma sessão que nunca mais voltaria. Agora recebe 401.

**`apps/api/src/modules/auth/auth.liveSession.ts` é o dono do termo**, com quatro exports e um
cabeçalho que explica por que são dois filtros:

- `liveSessionWhere(now?)` — as três cláusulas, na forma que o Prisma entende.
- `liveSessionsOfUserWhere(userId, now?)` — o recorte por usuário, que toda **leitura** usa.
- `reachableSessionsOfUserWhere(userId, now?)` — o que a **invalidação** alcança, construído a
  partir do anterior pela remoção explícita de `usedAt` (desestruturação, não um segundo literal).
  Superconjunto por construção: não há como um dos dois mudar sem o outro.
- `isLiveSession(session, now?)` — a mesma definição para uma linha que já está em memória.

E uma operação, `invalidateSessionsOfUser(client, userId, at)`. O `at` é **obrigatório** porque
quase todo chamador roda dentro de uma transação com um `new Date()` só propagado pela cadeia
(regra de `user.lifecycle.repository.ts`); ele é o corte do prazo **e** a marca gravada. O cliente
chega por parâmetro — o módulo nunca vai buscar o Prisma sozinho, e por isso continua sendo o
repository quem fala com o banco.

**Os oito sites viraram cinco chamadas e nenhuma coluna soletrada.** Em `auth.repository.ts`: o
teto de sessões e a listagem passam a usar `liveSessionsOfUserWhere`; `invalidateAllUserSessions`
(a cascata de roubo), `consumePasswordReset` e `updatePasswordAndInvalidateSessions` delegam a
operação. Em `user.repository.ts`, os três blocos de sete linhas de ban, deleção e reset forçado
viraram uma linha cada — o repositório de usuário não menciona mais nenhuma coluna de `Session`.

**Uma quarta grafia, em memória, também sumiu.** `revokeSession` buscava a sessão por id e depois
conferia a vivacidade com `!session.usedAt && !session.invalidatedAt && session.expiresAt > new
Date()`. Como os dois desfechos são o mesmo 404 — revogar uma sessão morta não é caso distinto de
revogar uma que não existe —, a vivacidade virou cláusula da busca: `findSessionByIdForUser` deu
lugar a `findLiveSessionByIdForUser`. E `classifyGraceLink` passa a decidir o estado `LIVE` pelo
`isLiveSession`, para que `LIVE` ali signifique o mesmo que `LIVE` em `GET /auth/sessions`.

**Os testes.** `tests/unit/modules/auth/auth.liveSession.test.ts` prova as partes puras: as três
cláusulas exatas, o recorte por usuário, o `gt` (uma sessão que expira *exatamente agora* não é
viva) e que o filtro da invalidação é o de leitura **menos uma cláusula**, verificado chave a
chave. `tests/integration/modules/auth/auth.liveSession.test.ts` dirige o filtro e a invalidação
contra o banco: a listagem separa a viva das três que não são; a invalidação mata a viva e o elo
rotacionado, não remarca a já morta (a primeira morte é a que vale), deixa a expirada em paz, não
encosta em outro usuário, desfaz junto com a transação que a contém — e, numa tabela, que os
quatro sites de escrita (ban, deleção, reset forçado, troca de senha) não deixam elo rotacionado
de pé. Uma mutação de controle (devolver o filtro estreito na invalidação) derruba cinco testes:
os três novos e os dois de integração que já guardavam a invariante.

**Comportamento externo:** idêntico em todo caminho que a suíte cobre — 1416 testes da API em 82
arquivos, verdes sem edição de nenhum teste existente. A única mudança observável é a de corner
descrita acima (503 → 401 depois de ban/deleção/reset forçado, com o Redis fora do ar), que é o
ponto da decisão.

**Sem ADR**, como a spec prevê: a decisão completa `apps/api/docs/adr/0057-janela-graca-10s-rotacao.md`
em vez de criar alternativa nova. O glossário (`apps/api/CONTEXT.md`) passa a apontar para o
módulo, e diz o que antes ficava implícito — que derrubar alcança um elo a mais que listar.
