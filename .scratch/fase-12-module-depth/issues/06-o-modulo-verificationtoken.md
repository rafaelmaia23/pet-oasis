# 06: O módulo `VerificationToken`: emitir e consumir

**What to build:** o token de verificação passa a ser uma coisa só no código, como já é no
glossário: opaco, uso único, hasheado em repouso, com `purpose` e expiração. Hoje cada purpose
reconstrói a sequência — cinco sites de emissão, quatro transações de consumo — e o predicado de
validade está retipado verbatim quatro vezes. Uso único é imposto em oito lugares independentes:
tirar uma cláusula de um deles transforma aquele token numa credencial replayável, e nada
estrutural percebe.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-23

- [x] Um módulo com **emitir** e **consumir**, parametrizado por `purpose` e TTL
- [x] O consumo recebe o efeito colateral do purpose e o roda **dentro** da mesma transação que
      marca o token como usado
- [x] As quatro transações de consumo do repositório colapsam em uma
- [x] O serviço de cada purpose sobrevive como arquivo — perde o boilerplate, mantém a orquestração
      (exigência de ADR-0072 da API)
- [x] A escrita de auditoria transacional continua no repositório (ADR-0098 da API)
- [x] Teste unitário do consumo contra token desconhecido, já usado, expirado e de purpose errado
- [x] Um teste de integração por purpose continua provando o efeito colateral; nenhum é apagado
- [x] O 400 genérico de token inválido continua genérico (ADR-0071 da API): nada no corpo distingue
      "não existe" de "expirado"

## O que ficou

**O dono do termo são dois arquivos, um por camada**, e a divisão é a mesma que o projeto já
usa: `apps/api/src/modules/auth/verificationToken.repository.ts` (a validade, a criação e a
**única** transação de consumo) e `apps/api/src/modules/auth/verificationToken.service.ts` (o
prazo por purpose, o sorteio do token, a recusa genérica e a ordem dos passos). Quem toca o
Prisma continua sendo só o repository, e nenhum service abre transação.

**Consumir virou uma operação só.** `consumeToken(token, effect, audit)` marca `usedAt`, roda o
efeito do purpose e grava a linha de auditoria na mesma transação — as quatro transações de
`auth.repository.ts` colapsaram nesse corpo. O efeito recebe **o token que autorizou a ação**, e
é dele que saem o dono e a escolha congelada (`restoreProfiles`, `restoreRoleIds`, `newEmail`):
antes o service redigitava esses valores no argumento, e nada impedia que a reativação restaurasse
um perfil que o token não trouxe.

**A ordem virou estrutura, e o trabalho caro ficou fora da transação.** `consumeVerificationToken`
valida → chama o `plan` do purpose → roda a transação. O `plan` é onde cada service faz o que só
ele sabe: buscar o usuário, recusar conta suspensa, exigir telefone, hashear a senha. Roda **fora**
da transação de propósito — um bcrypt não segura conexão de banco, e uma recusa dali não queima o
token. E roda **depois** da validação, que é o que garante que um token ruim não custe nada.

**Os cinco sites de emissão viraram `issueVerificationToken`**, que devolve o valor cru e guarda o
hash. O quinto — o reset forçado por admin — é o único que não podia usá-lo inteiro: o token nasce
dentro da transação que marca `mustChangePassword` e derruba as sessões. Ele usa
`mintVerificationToken(purpose)` (sorteio + prazo) e `createVerificationTokenIn(tx, …)`, então o
TTL e o hash continuam vindo de um lugar só; `user.service.ts` não conhece mais
`generateOpaqueToken`, `hashToken` nem `PASSWORD_RESET_TTL_MS`. O idioma "no máximo um pendente
por purpose", que troca de email e reativação repetiam, virou a opção `supersedePending`.

**O prazo agora é um `Record<VerificationPurpose, number>`:** um `purpose` novo sem TTL declarado
não compila. Ele também tornou visível uma coisa que estava escondida em duas constantes com o
mesmo valor — a troca de email usa o TTL da verificação de email (24h). Comportamento inalterado,
só explícito.

**O predicado de validade é um lugar só, e um type guard.** `isUsableVerificationToken(token,
purpose, now)` recebe `null` de propósito: o token desconhecido não é um quarto desfecho, é o
mesmo (ADR-0071). A fronteira do prazo é `>`, como o `gt` do banco. O log de recusa passou a ser
uma linha só, com `purpose` e `reason` estruturados (`UNKNOWN_TOKEN`, `WRONG_PURPOSE`,
`ALREADY_USED`, `EXPIRED`) — antes eram quatro mensagens com **dois** vocabulários de `reason`
diferentes, e um deles chamava purpose errado de "expirado".

**Os quatro services sobreviveram como arquivos, e encolheram.** `verification.service.ts` (86 →
69 linhas), `password.service.ts`, `emailChange.service.ts` e `accountReactivation.service.ts`
mantêm a orquestração que o ADR-0072 exige que fique neles — o email, os guards próprios, o corpo
do 400 e qual efeito aplicar — e perderam o `generateOpaqueToken`/`hashToken`/`findVerificationToken`
/`if (purpose !== … || usedAt !== null || expiresAt < new Date())` que cada um repetia.

**Os testes.** `tests/unit/modules/auth/verificationToken.test.ts` (18 casos) prova o que é puro:
os quatro motivos de recusa, que **nada no corpo do 400 os distingue**, que a busca é pelo hash e
nunca pelo valor cru, que o plano só é montado depois da validação (`["find", "plan", "consume"]`)
e que a recusa não chama o repositório. `tests/integration/modules/auth/verificationToken.test.ts`
(9 casos) prova o que só o banco prova: o hash guardado, a escolha congelada, que
`supersedePending` queima o pendente do mesmo purpose **e só ele**, e — o caso que justifica a
transação — que **um efeito que falha não deixa o token queimado, nem o efeito parcial, nem a
linha de auditoria**. Nenhum teste de integração foi apagado; dois tiveram a chamada de setup
adaptada à API nova (`audit.test.ts`, `auth.liveSession.test.ts`).

**Comportamento externo:** idêntico. 1457 testes em 85 arquivos, verdes; `typecheck`, `lint` e
`docs:check` limpos.

**Um achado que não é meu para resolver, e por isso foi para o backlog.** Uso único é
leitura-depois-escrita: duas requisições simultâneas com o mesmo token válido passam as duas pelo
predicado. O estado é o mesmo de antes deste esforço (o módulo herdou a forma das quatro
transações), a correção é conhecida (`updateMany` com `usedAt: null` no `where`), mas **o que a
segunda requisição recebe** é regra de negócio. Está em `docs/reference/backlog.md`, na seção de
segurança, com as opções e o custo.

**Onde a decisão passou a morar:** `apps/api/docs/adr/0069-verificationtoken-generico-purpose.md`
ganhou o lado que faltava — o modelo genérico agora tem um módulo genérico —, como a spec previa
ao não pedir ADR novo. O glossário (`apps/api/CONTEXT.md`) aponta para o módulo e ganhou o verbo
**consumir um token**, que é a invariante em uma frase.
