# 11: Tirar a URL pública do cliente da allowlist de CORS

**What to build:** a allowlist deixa de conceder origem por inércia. Hoje a URL pública do
cliente entra na allowlist por ser presumidamente quem chama por navegador. Depois da migração
de domínio ela passa a ser o front — que adota BFF e **não** chama por navegador, porque quem
fala com a API é o servidor dele. A entrada viraria permissão concedida a um consumidor que não
existe.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A allowlist deixa de derivar da variável de URL pública do cliente, e passa a sair só da
      variável explícita de origens permitidas.
- [ ] O middleware e a variável explícita **ficam**, para o dia em que existir um cliente de
      navegador de outra origem.
- [ ] O guia de integração diz onde CORS **não** se aplica: cliente com BFF (a requisição não
      tem origem), app mobile nativo (não há navegador nem preflight), script e coleção de
      requisições. App mobile **não** é motivo para manter allowlist.
- [ ] Testes existentes de preflight e de origem fora da allowlist continuam verdes, com a
      allowlist agora vindo só da variável explícita.
