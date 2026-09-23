# 04: O cookie de refresh vira um módulo de três operações

**What to build:** as propriedades de segurança do cookie de sessão passam a ser decididas num lugar
só, e testáveis. Hoje a política vive em quatro expressões do controller de auth — dois blocos de
seis atributos idênticos, três leituras com cast, um `clearCookie` com o path repetido — e é
afirmada por um único teste, no login. Na prática: o refresh pode perder `httpOnly` ou `sameSite` e
a suíte fica verde, e `secure` em produção não é alcançado por nenhum teste.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Um módulo com três operações — emitir o cookie numa resposta, ler da requisição, limpar — dono
      dos atributos e do path
- [ ] O controller de auth para de conhecer o ambiente, o TTL e o cast do jar de cookies
- [ ] `set` e `clear` usam o mesmo path por construção, não por dois literais iguais
- [ ] Teste unitário contra uma resposta falsa cobrindo os atributos por ambiente, **incluindo**
      `secure` em produção
- [ ] Os testes de integração de login, refresh, logout e listagem de sessões seguem verdes, sem
      alteração
- [ ] O cabeçalho do módulo registra que o BFF do web espelha esta política (esforço
      `fase-12-web-auth-spine`), para que as duas não divirjam
