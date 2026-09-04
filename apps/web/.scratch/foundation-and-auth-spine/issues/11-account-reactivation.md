# 11: Reativação de conta

**What to build:** quem excluiu a conta e voltou recupera o que era seu, em vez de recomeçar
do zero — e ninguém descobre, pelo cadastro, que um email pertence a uma conta excluída.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Cadastro com email de conta excluída **não confirma** que a conta existe, e comunica que,
      havendo conta, as instruções chegarão por email
- [ ] O caso recusado pela API é comunicado sem revelar o motivo — a API responde genérico de
      propósito, e a interface não decifra
- [ ] A rota de reativação consome o token
- [ ] **Senha nova é obrigatória.** A senha antiga não volta a valer
- [ ] Telefone é pedido **apenas** quando o perfil de `Customer` precisa nascer do zero
- [ ] Token imprestável recebe o mesmo tratamento do ticket 09
- [ ] O sucesso leva ao login, e a entrada funciona com a senha nova
- [ ] E2E usa o `User` soft-deletado do seed da API
