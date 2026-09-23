# Um `VerificationToken` genérico, com `purpose`

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Verificação de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Email-verification e password-reset compartilham exatamente a mesma forma (token opaco, hash
SHA-256 salvo, `expiresAt`, `usedAt`, `userId`) — só mudam finalidade e TTL. Um model com `purpose`
evita dois repositórios quase idênticos. Reusa `hashToken` de `src/lib/token.ts` (mesmo padrão do
refresh: guarda só o hash, entrega o cru ao usuário). `change-password` não usa esse model: não há
token, a prova é a senha atual. O enum cresceu depois com `EMAIL_CHANGE` (7.15) e
`ACCOUNT_REACTIVATION` (8.4).

## O modelo genérico ganhou um módulo genérico (Fase 12, esforço `module-depth`)

O `purpose` unificou a **tabela**; o código continuou sendo quatro cópias da mesma sequência —
cinco sites de emissão, quatro transações de consumo, e o predicado de validade (purpose errado ·
`usedAt` não nulo · expirado) retipado verbatim quatro vezes. Uso único era imposto em oito
lugares independentes: tirar uma cláusula de um deles transformava aquele token numa credencial
replayável, e nada estrutural perceberia.

O dono do termo passou a ser `apps/api/src/modules/auth/verificationToken.repository.ts` (a
validade, a criação e a **única** transação de consumo) mais
`apps/api/src/modules/auth/verificationToken.service.ts` (o prazo por purpose, o sorteio do
token, a recusa genérica e a ordem dos passos). **Consumir é uma operação só:** marcar `usedAt`,
rodar o efeito do purpose e gravar a linha de auditoria, na mesma transação — se o efeito falha, a
marca cai junto, porque queimar uma credencial de uso único sem a ação ter acontecido deixaria o
usuário sem nada a apresentar de novo.

O efeito chega por parâmetro, construído no repository (`activateUser`, `applyPasswordReset`,
`applyEmailChange`, `applyAccountReactivation`), e recebe o token que autorizou a ação — é de lá
que saem o dono e a escolha congelada, em vez de virem repetidos pelo chamador. O trabalho caro e
os guards que faltam (conta suspensa, perfil a criar, hash da senha) rodam **fora** da transação,
num passo que o service do purpose monta e o módulo roda entre a validação e a escrita: um argon2
não segura conexão de banco, e uma recusa dali não queima o token.

O que cada purpose continua decidindo sozinho, no service dele, é o que
[`0072`](0072-orquestracao-vive-verification-service-ts-nao-auth.md) exige que continue lá: o
email, os guards próprios, o corpo do 400 genérico de
[`0071`](0071-token-invalido-expirado-usado-400-generico.md) e qual efeito o consumo aplica. A
gravação transacional do audit continuou no repository, como
[`0098`](0098-gravacao-transacional-audit-vive-repository-service.md) manda.
