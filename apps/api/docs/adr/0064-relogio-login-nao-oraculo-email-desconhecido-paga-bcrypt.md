# O relógio do login não é oráculo: email desconhecido paga o bcrypt (10.9)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Status da conta*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Igualar status, `code` e mensagem entre senha errada e email desconhecido não bastava: o ramo sem
conta devolvia antes de qualquer hash e o ramo com conta gastava o custo do bcrypt, e a diferença
era **mensurável de fora** — medida na fronteira HTTP com o custo real (12 rounds), 20 amostras
intercaladas por tipo, mediana de **5 ms contra 172 ms**. Trinta vezes: um oráculo de existência
de conta que anulava o anti-enumeração acima. O ramo sem conta passou a verificar a senha
recebida contra um **hash de ninguém** (`simulatePasswordVerification`, em `src/lib/password.ts`),
e as medianas ficaram em **171 ms contra 172 ms**. O resíduo de ~1 ms é a gravação do contador
de lockout no Redis, que só o ramo com conta faz — dentro do ruído em latência de rede local.

O hash de ninguém é cunhado **na carga do módulo**, uma vez por processo, pelo mesmo
`hashPassword` dos hashes reais, a partir de um texto aleatório descartado: assim carrega o mesmo
custo por construção, sem um literal a manter em sincronia com `SALT_ROUNDS` — e é fixo de
verdade, sem uma primeira requisição que pague a cunhagem e destoe. A verificação passa pelo
próprio `verifyPassword`, então o caminho de código é o mesmo, não só o custo. O resultado é
ignorado — a função existe para gastar tempo, não para decidir. Nada mudou de fora: mesmo 401, mesmo `code`, mesma
mensagem; o audit log continua distinguindo os dois pela presença de `targetId`, porque a trilha
é quem precisa saber.

**O teste é no seam da `lib`, não na fronteira HTTP — de propósito.** A suíte roda o bcrypt com
custo 4 (~1 ms), e ali o hash some debaixo dos ~5 ms de overhead do supertest: um teste HTTP de
medianas passava **antes** da correção, ou seja, não guardava nada. O teste que ficou compara,
em `tests/unit/lib/password.test.ts`, o custo de `simulatePasswordVerification` com o de
`verifyPassword` contra um hash real, medianas dentro de uma razão de 2× — e fica vermelho se a
função deixar de chamar o bcrypt (verificado sabotando-a). A prova na fronteira HTTP é a medição
manual acima, com o custo de produção; o comando e a saída ficaram registrados na issue 09 da
Fase 10. O resíduo de ~1 ms (o contador de lockout, só no ramo com conta) está em
`docs/reference/backlog.md`.
