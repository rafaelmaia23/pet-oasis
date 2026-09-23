# O access token tem algoritmo pinado, `iss`/`aud` obrigatórios e folga de relógio explícita (10.10)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Segurança** › *Hardening HTTP*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`jwt.verify(token, segredo)` sem `algorithms` aceita o algoritmo que o **header do token**
declarar — é a *algorithm confusion* de manual: com segredo simétrico, um `HS512` assinado pelo
mesmo segredo passava; e, se um dia a verificação ganhasse chave pública, um `HS256` assinado com
a própria chave pública como segredo passaria também. Sem `issuer`/`audience`, qualquer token que
o segredo assine serve — venha ele de outro deploy que compartilhe o segredo por engano ou de
outro uso futuro do mesmo segredo. O endurecimento é o de sempre: `algorithms: ["HS256"]`,
`issuer` e `audience` exigidos, `clockTolerance` explícita.

O que a issue chamou de "poucas linhas" ganhou um módulo, `src/lib/accessToken.ts`, por uma razão
só: **quem assina e quem verifica leem as mesmas constantes.** Emissão no `auth.service` e
verificação no `authenticate` liam cada uma o próprio `jwt.*` cru, e o contrato do token estava
implícito na coincidência entre os dois — pinar o algoritmo num lado e esquecer o outro seria
exatamente o tipo de deriva silenciosa que o hardening quer impedir. `signAccessToken` e
`verifyAccessToken` são a fronteira: o middleware só sabe "passou" ou "não passou", e o motivo da
recusa (assinatura, algoritmo, claim, validade) fica de fora de propósito, porque o 401 é o mesmo
genérico para todos. `iss` e `aud` são **constantes, não env vars**, pelo mesmo motivo da janela
de graça: não são botão de produção. Coincidem (`pet-oasis-api`) porque a API é as duas coisas —
quem cunha e quem consome; o ganho está em **exigi-los**, não em distingui-los. A folga de relógio
é de **5 segundos**: quem assina e quem verifica é o mesmo serviço sob NTP, a folga cobre desvio
entre réplicas e não relógio de cliente, e toda folga estende a vida útil do token na mesma
medida.

**Consequência de implantação, dita em vez de descoberta:** o token emitido pela versão anterior
não carrega `iss` nem `aud`, então o deploy desta mudança **invalida todo access token em voo**.
Com 15 minutos de vida a janela é curta, e o cliente que já trata o 401 com `refresh` (o fluxo
normal de expiração) recompõe o par sem que o usuário perceba — o refresh token é opaco e não
muda. Um cliente que só trate expiração por relógio, sem reagir ao 401, vê uma sessão "expirar"
antes da hora, uma vez. Há teste para o token no formato antigo, para que a consequência fique
escrita onde se lê o comportamento.

Os testes ficaram em dois seams: a lib (`tests/unit/lib/accessToken.test.ts`) prova cada peça do
contrato isolada — forjando com o **mesmo segredo** e uma só coisa fora do lugar, para que a
recusa venha da claim e não da assinatura —, e a fronteira HTTP (`security.test.ts`) prova que o
`authenticate` honra o contrato e que o token do login continua entrando. O middleware tem um
caso de regressão (audiência errada → 401) para o dia em que alguém religar um `jwt.verify` cru
ali.
