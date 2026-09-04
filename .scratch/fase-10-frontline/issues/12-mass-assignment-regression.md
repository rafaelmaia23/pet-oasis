# 12: Regressão explícita de mass assignment

**What to build:** garantia de que nenhum schema de update aceita, vindo do corpo da requisição,
um campo que só o sistema deveria escrever — estado da conta, vínculo de papel, marca de
banimento, marca de senha forçada. Se o comportamento padrão do validador já rejeita chaves
desconhecidas, este item **é** o teste: vale ter, porque é o tipo de proteção que se perde em
silêncio num refactor e que ninguém percebe até virar incidente.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Levantamento de todos os schemas de update e do que cada um aceita.
- [ ] Teste por schema afirmando que a chave privilegiada enviada no corpo é rejeitada ou
      descartada — e que o campo no banco **não** mudou.
- [ ] Se algum schema estiver de fato permissivo, corrigir; se todos já estiverem cobertos, o
      resultado é só a suíte nova, e isso é registrado como resultado legítimo, não como item
      vazio.
