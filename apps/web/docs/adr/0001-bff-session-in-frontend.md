# A sessão vive num BFF no front, não no cliente

> Revisto em 2026-09-19 contra o guia de integração da API: o refresh passou a viajar em
> cookie, e o guia oferece dois modos de BFF — a escolha está registrada abaixo.

A API entrega o access token (JWT de 15 minutos) no corpo do login, para ser enviado como
`Bearer`, e o refresh token num cookie `HttpOnly` sob `Path=/api/v1/auth`, que
`/auth/refresh` e `/auth/logout` leem de lá. O ADR de auth dela deixou explícito que a forma
final seria decidida "ao definir o(s) cliente(s) real(is)". O cliente real é este, e é só
navegador. Decidimos guardar access e refresh num cookie `httpOnly` criptografado
(`iron-session`) do **domínio do front**, com Route Handlers fazendo o proxy da
autenticação: o token nunca chega ao JavaScript e as páginas autenticadas podem renderizar
no servidor.

**Entre os dois modos de BFF que o guia oferece, o escolhido é o segundo.** O primeiro
repassa o cookie da API ao navegador e exige que a rota do BFF que renova viva sob um path
que case com `/api/v1/auth` — modo de falha silencioso: o login funciona e o primeiro refresh,
quinze minutos depois, chega sem cookie. O segundo faz do BFF o único portador: o módulo de
sessão lê o `Set-Cookie` da resposta da API, guarda o refresh na sessão própria e o reenvia
como `Cookie` em `/auth/refresh` e `/auth/logout`. O navegador só conhece o cookie do front.

## Considered Options

- **Token em memória no cliente.** Não exige nada de ninguém, mas descarta o RSC na área
  autenticada e transforma o Next num SPA com roteador melhor — jogando fora a razão de
  ter escolhido Next.
- **Mudar a API para aceitar cookie de access token.** É a saída que o próprio ADR da API
  nomeia. Recusada: traria CSRF de volta ao escopo da API para resolver um problema que o
  front resolve sozinho.

## Consequences

- **Server Component não escreve cookie.** Logo, a rotação do refresh não pode ser reativa
  (no 401): tem que ser proativa, no `middleware`, com margem de 60s.
- **A validade do access token vem da resposta da API, não do JWT.** O guia proíbe decodificar
  o token para decidir qualquer coisa — o conteúdo dele é da API — e um TTL configurado no
  front seria uma segunda cópia do `JWT_EXPIRES_IN` dela, que a deixaria deslogando gente no
  dia em que a API o encurtasse. A resposta de login/refresh informa a validade, tipada pelo
  contrato; enquanto não informar, esta fatia não começa (issue `00`).
- **O cookie do front vale 7 dias deslizantes**, o mesmo que o refresh da API, e é renovado
  junto com ele. Os dois expiram juntos: "por que fui deslogado" tem uma resposta só, e um
  cookie do front que sobrevivesse ao refresh só carregaria uma sessão morta até o primeiro
  refresh recusado.
- **A API mata todas as sessões do usuário quando um refresh já consumido reaparece** — é
  detecção de reuso, e é o comportamento certo lá. Contra rotação no middleware vira risco
  de falso positivo, porque o prefetch do `<Link>` gera concorrência sem o usuário clicar
  em nada. Três travas: não renovar em requisição de prefetch (`Next-Router-Prefetch`),
  *single-flight* por sessão em memória, e `matcher` excluindo estático e imagem.
- **As travas bastam com um processo Node só**, que é o desenho atual. Deixam de bastar com
  segunda réplica do front ou com um cliente mobile, porque a trava em memória não é
  compartilhada. A API cobre essa sobra com uma **janela de graça**: o refresh imediatamente
  anterior é aceito por 10 segundos a partir do uso, devolvendo **o mesmo par** já emitido
  naquela rotação. Isso **não substitui as travas** — é rede de segurança para a corrida que
  elas não alcançam. Fora da janela, reuso continua sendo roubo e continua derrubando tudo.
- **Dentro da janela, o par que volta é o atual — não necessariamente o que aquela rotação
  emitiu.** Quem chega atrasado com o token mais antigo recebe o par mais recente. O módulo
  trata a resposta como a verdade e sobrescreve o que tinha.
- **Um 503 no `/auth/refresh` é retentável e não destrói nada.** É o que a API responde quando
  não consegue reproduzir o par dentro da janela, em vez de decidir entre concorrência e
  roubo. É o único 5xx dela que significa "tente de novo em um instante": tratá-lo como falha
  de sistema desloga alguém sem necessidade. O primeiro 503 abre uma janela própria de **30
  segundos** para retentar aquele mesmo token, mesmo passados os dez da rotação — retentar
  imediatamente, com backoff curto; depois dela a reapresentação é indistinguível de roubo.
- **O `id` de uma `Session` muda a cada renovação**, ou seja, a cada quinze minutos — uma
  `Session` é um elo de corrente, não um dispositivo. Tela de dispositivos que guarde o `id`
  entre renderizações mira um alvo que já não existe, e a revogação responde 404 sem que nada
  esteja errado. Releia a lista antes de agir sobre ela.
