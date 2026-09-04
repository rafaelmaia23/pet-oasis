# A sessão vive num BFF no front, não no cliente

A API entrega o access token no corpo do login para o cliente guardar e enviar como
`Bearer`, e o ADR de auth dela (`auth-token-revocation.md`) deixou explícito que a forma
final seria decidida "ao definir o(s) cliente(s) real(is)". O cliente real é este, e é só
navegador. Decidimos guardar access e refresh num cookie `httpOnly` criptografado
(`iron-session`) do **domínio do front**, com Route Handlers fazendo o proxy da
autenticação: o token nunca chega ao JavaScript e as páginas autenticadas podem renderizar
no servidor.

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
- **A API mata todas as sessões do usuário quando um refresh já consumido reaparece** — é
  detecção de reuso, e é o comportamento certo lá. Contra rotação no middleware vira risco
  de falso positivo, porque o prefetch do `<Link>` gera concorrência sem o usuário clicar
  em nada. Três travas: não renovar em requisição de prefetch (`Next-Router-Prefetch`),
  *single-flight* por sessão em memória, e `matcher` excluindo estático e imagem.
- **As travas bastam com um processo Node só**, que é o desenho atual. Deixam de bastar com
  segunda réplica do front ou com um cliente mobile, porque a trava em memória não é
  compartilhada. O pedido de uma janela de graça na API está registrado no backlog dela.
