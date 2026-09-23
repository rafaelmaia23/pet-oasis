# 06: Guarda de rota e identidade do usuário

**What to build:** páginas autenticadas deixam de ser alcançáveis por quem não entrou, e quem
foi barrado volta exatamente para onde ia depois de entrar. A interface passa a saber quem é
o `User` e o que ele pode.

**Blocked by:** 00, 05

**Status:** ready-for-agent

- [ ] Middleware barra o acesso à Área do cliente quando não há sessão
- [ ] Quem é barrado vai ao login e, ao entrar, **volta ao destino original**
- [ ] Sessão expirada devolve ao login **sem mensagem de erro** — expirar não é falha do
      usuário
- [ ] O middleware decide **apenas** se há sessão. Não consulta capability e não autoriza por
      feature
- [ ] Identidade e **capability efetiva** lidas de `GET /me` por requisição (view `me` do
      contrato), memoizadas dentro da requisição para não repetir a chamada
- [ ] O resultado **nunca** é persistido no cookie
- [ ] `can()` honra o **wildcard** de administrador — sem isso o administrador não vê nada
- [ ] `can()` respeita negação explícita sobrepondo concessão
- [ ] `can()` é testado direto, como função pura, com esses dois casos
- [ ] Os tokens não aparecem em `document.cookie` nem em qualquer objeto alcançável pelo
      script da página — provado por teste
- [ ] O `Híbrido` cai numa página de destino **provisória**, marcada como provisória no código
- [ ] A Área do cliente existe como casca: layout, navegação e identificação do `User`
