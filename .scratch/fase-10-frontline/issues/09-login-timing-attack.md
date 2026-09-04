# 09: Igualar o tempo de resposta do login

**What to build:** um email inexistente e uma senha errada demoram o mesmo tanto. Hoje o email
inexistente provavelmente responde em poucos milissegundos, enquanto o existente com senha
errada gasta o tempo do hash — e essa diferença vira oráculo de existência de conta, anulando o
cuidado anti-enumeração já tomado nos fluxos de recuperação e de reenvio de verificação.

**Blocked by:** 08 (sequenciamento: edita a mesma função de login; o custo marginal depois da 08
é quase zero).

**Status:** ready-for-agent

- [ ] O caminho de email desconhecido verifica contra um hash dummy fixo, igualando o tempo dos
      dois caminhos.
- [ ] A resposta continua idêntica nos dois casos — mesma mensagem, mesmo status, mesmo
      identificador.
- [ ] O registro no audit log continua distinguindo os dois internamente, porque a trilha é
      quem precisa saber.
- [ ] **Este é o único item da fase cujo teste é chamada de julgamento.** A proposta é limite
      estatístico largo na fronteira HTTP: medianas de N tentativas de cada tipo dentro de uma
      razão generosa. Se der flake, o teste vira **medição manual documentada** — e **não** vira
      retry, que só esconderia o flake.
