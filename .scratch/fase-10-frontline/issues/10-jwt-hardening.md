# 10: Endurecer a verificação do JWT

**What to build:** o token de acesso deixa de estar exposto a *algorithm confusion*, e passa a
ser recusado quando não foi emitido por nós ou não é para nós. Poucas linhas, vulnerabilidade de
manual.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-16

- [x] O algoritmo é fixado na verificação — sem pinar, o token fica exposto a troca de
      algoritmo.
- [x] Emissor e audiência são definidos na emissão e validados na verificação.
- [x] Tolerância de desvio de relógio definida explicitamente.
- [x] Testes afirmando recusa de: token com algoritmo diferente, emissor errado, audiência
      errada. E aceitação do token legítimo, para provar que o endurecimento não quebrou o
      caminho feliz.
- [x] Consequência registrada: tokens emitidos antes desta mudança não carregam emissor nem
      audiência, então a implantação invalida os que estiverem em voo. Com 15 minutos de vida,
      a janela é curta — mas é preciso dizê-lo em vez de descobrir.

## O que foi feito

O contrato do access token saiu dos dois `jwt.*` crus (emissão em `auth.service`, verificação em
`authenticate.middleware`) e ganhou um módulo, `src/lib/accessToken.ts`: `signAccessToken(userId)`
e `verifyAccessToken(token)` leem as **mesmas** constantes — `HS256`, `iss`/`aud`
(`pet-oasis-api`, constantes e não env vars, pelo mesmo motivo da janela de graça), e
`clockTolerance` de **5s** (mesmo serviço sob NTP: a folga cobre réplica, não cliente, e toda
folga estende a vida do token). O middleware só sabe "passou"/"não passou"; o motivo da recusa
fica dentro da lib de propósito, porque o 401 é o mesmo genérico para todos.

Testes em dois seams. A lib (`tests/unit/lib/accessToken.test.ts`, 11 casos): caminho feliz;
recusa de `HS512` com o mesmo segredo e de `alg: none`; emissor errado, audiência errada, e o
token **sem** `iss`/`aud` (o formato de antes desta issue); expiração dentro e fora da folga;
`sub` ausente. Verificado sabotando a lib (sem `algorithms`, sem `issuer` na verificação): os
dois casos correspondentes ficam vermelhos. A fronteira HTTP (`security.test.ts`, bloco "Bordas
HTTP — JWT"): o token do login entra em `GET /me`; os forjados com o mesmo segredo e uma claim
errada morrem em 401 com a mensagem genérica; o token de formato antigo também. O teste do
middleware ganhou um caso de regressão (audiência errada → 401, sem tocar o banco) para o dia em
que alguém religar um `jwt.verify` cru ali.

**Consequência de implantação:** o deploy invalida todo access token em voo — o cliente que
trata o 401 com `refresh` (fluxo normal de expiração) recompõe o par sem o usuário notar; o
refresh token é opaco e não muda. Registrado em `apps/api/docs/adr/0129-access-token-tem-algoritmo-pinado-iss-aud-obrigatorios.md`, indexado em `apps/api/docs/adr/README.md`, e o item do backlog riscado.
