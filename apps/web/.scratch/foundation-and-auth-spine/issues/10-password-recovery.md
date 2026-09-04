# 10: Recuperação de senha

**What to build:** quem esqueceu a senha recupera o acesso sozinho, sem falar com ninguém.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Pedir o link informando apenas o email
- [ ] A resposta é **idêntica** para email existente e inexistente — ninguém descobre quem
      tem conta
- [ ] Excesso de pedidos mostra quanto tempo esperar
- [ ] A rota de redefinição consome o token e aceita a senha nova
- [ ] Senha fraca é recusada no próprio campo
- [ ] Token imprestável recebe o mesmo tratamento do ticket 09, com opção de pedir outro
- [ ] A pessoa é avisada de que redefinir **encerra as outras sessões**, antes de confirmar
- [ ] O sucesso leva ao login
- [ ] E2E: pede o link, lê o email, redefine e entra com a senha nova
- [ ] E2E prova que uma sessão aberta em outro contexto deixou de valer após a redefinição
