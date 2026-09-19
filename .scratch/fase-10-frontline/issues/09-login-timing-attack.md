# 09: Igualar o tempo de resposta do login

**What to build:** um email inexistente e uma senha errada demoram o mesmo tanto. Hoje o email
inexistente provavelmente responde em poucos milissegundos, enquanto o existente com senha
errada gasta o tempo do hash — e essa diferença vira oráculo de existência de conta, anulando o
cuidado anti-enumeração já tomado nos fluxos de recuperação e de reenvio de verificação.

**Blocked by:** 08 (sequenciamento: edita a mesma função de login; o custo marginal depois da 08
é quase zero).

**Status:** fechada em 2026-09-14

- [x] O caminho de email desconhecido verifica contra um hash dummy fixo, igualando o tempo dos
      dois caminhos.
- [x] A resposta continua idêntica nos dois casos — mesma mensagem, mesmo status, mesmo
      identificador.
- [x] O registro no audit log continua distinguindo os dois internamente, porque a trilha é
      quem precisa saber.
- [x] **Este é o único item da fase cujo teste é chamada de julgamento.** A proposta é limite
      estatístico largo na fronteira HTTP: medianas de N tentativas de cada tipo dentro de uma
      razão generosa. Se der flake, o teste vira **medição manual documentada** — e **não** vira
      retry, que só esconderia o flake.

## O que foi feito

Medido antes de mexer, na fronteira HTTP com o custo real do bcrypt (12 rounds), 20 amostras
intercaladas por tipo: mediana de **5,3 ms** para email desconhecido contra **171,7 ms** para
senha errada — razão 0,03, um oráculo de existência de conta trinta vezes mais lento num lado.

O ramo sem conta do `login` passou a chamar `simulatePasswordVerification(data.password)`
(`src/lib/password.ts`): `verifyPassword` contra um **hash de ninguém**, cunhado na carga do
módulo pelo mesmo `hashPassword` dos hashes reais a partir de um texto aleatório descartado —
mesmo custo por construção, sem literal a manter em sincronia com `SALT_ROUNDS`, e fixo de
verdade (nenhuma primeira requisição paga a cunhagem). O resultado é ignorado; a função existe
para gastar tempo. Depois: **171,1 ms contra 172,2 ms**, razão 0,99. O resíduo de ~1 ms é o
`recordFailure` do lockout no Redis, que só o ramo com conta faz — virou item próprio em
`docs/reference/backlog.md` ("Resíduo de tempo no login"), porque decidir se vale uma escrita
dummy no Redis é decisão de produto.

**Como a medição foi feita** (script descartável, não versionado): com o Postgres/Redis de
teste de pé (`npm run test:services:up`), um `.ts` que importa `app` de `@/app`, cria um usuário
via Prisma com `hashPassword`, sobe `app.listen(0)` e cronometra com `process.hrtime.bigint()`
20 pares intercalados de `POST /api/v1/auth/login` (email inexistente / email do usuário, ambos
com senha errada), dando `redis.flushdb()` antes de cada par por causa do limite de 20 logins por
IP. Invocação, com `NODE_ENV` fora de `test` para o bcrypt rodar em 12 rounds:

```
set -a; . ./.env.test; set +a
NODE_ENV=development LOG_LEVEL=silent npx tsx --tsconfig tsconfig.json measure-login-timing.ts
```

Saída antes / depois da correção (duas execuções cada, todas dentro de 1 ms destas):

```
samples=20 unknownEmail median=5.3ms   wrongPassword median=171.7ms ratio=0.03
samples=20 unknownEmail median=171.1ms wrongPassword median=172.2ms ratio=0.99
```

Resposta idêntica nos dois casos (já asserido em `auth.test.ts` desde a 10.8: mesmo 401, mesmo
`code`, mesma mensagem) e audit log distinguindo pela presença de `targetId` (já asserido em
`audit.test.ts`) — nenhum dos dois mudou.

**A chamada de julgamento do teste.** O teste estatístico na fronteira HTTP foi escrito primeiro
e **passava antes da correção**: a suíte roda o bcrypt com custo 4 (~1 ms), e ali as medianas
deram 5,2 ms contra 6,8 ms — o hash some debaixo do overhead do supertest. Não era flake, era
cegueira, e um teste que não fica vermelho não guarda nada; foi removido. O que ficou é o teste no
seam onde a propriedade **é** observável, `tests/unit/lib/password.test.ts`: mediana do custo de
`simulatePasswordVerification` dentro de 2× da de `verifyPassword` contra um hash real, mais a
garantia de que ela nunca devolve `true`. Verificado vermelho sabotando a função (sem o
`compare`, falha), e estável em três execuções. A prova na fronteira HTTP é a medição manual
acima, registrada com o método em `apps/api/docs/adr/README.md#identidade-e-sessões` (decisão "O relógio do
login não é oráculo").

Suíte completa, `typecheck`, `lint` e `docs:check` verdes.
