# 09: Verificação de email

**What to build:** a primeira jornada completa do produto fecha aqui — uma pessoa se cadastra,
recebe o email, clica no link, tem a conta ativada e consegue entrar.

O caminho de erro importa tanto quanto o de sucesso: um link já usado ou expirado é situação
**esperada**, não falha do sistema, e a pessoa precisa conseguir pedir outro sem sair da
página.

A rota `/verify-email` é contrato com a API — ela monta esse endereço nos emails. **Renomeá-la
quebra o email sem erro visível em lugar nenhum.**

**Blocked by:** 00, 08

**Status:** ready-for-agent

- [ ] A rota consome o token da query e ativa a conta
- [ ] Token inexistente, expirado ou já usado é tratado como **estado esperado da página**,
      nunca como página de erro do sistema
- [ ] Esse estado oferece pedir um link novo, ali mesmo
- [ ] A mensagem não revela **qual** das três condições falhou — a API não revela, e a
      interface não inventa
- [ ] O sucesso mostra confirmação visível e leva ao login
- [ ] Existe a página mínima de confirmação de troca de email, funcional: o fluxo que a
      alcança é da fatia seguinte, mas o link pode chegar antes
- [ ] Nenhuma das rotas de token foi renomeada
- [ ] E2E completo: cadastro → link lido do servidor de email de desenvolvimento → verificação
      → entrada bem-sucedida
