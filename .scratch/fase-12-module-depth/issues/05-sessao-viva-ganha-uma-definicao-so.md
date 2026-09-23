# 05: "Sessão viva" ganha uma definição só

**What to build:** o que `GET /auth/sessions` lista passa a ser, por construção, exatamente o que
ban, reset de senha e troca de email derrubam — que é o que o glossário afirma. Hoje são duas
grafias do mesmo conjunto: cinco sites usam as três cláusulas (não usada, não invalidada, não
expirada) e três sites de invalidação omitem a primeira. A direção é benigna hoje, mas os dois
conjuntos não são o mesmo, e o próximo site de escrita é cara ou coroa.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Uma definição de sessão viva exportada, composta por **toda** leitura e **toda** invalidação
- [ ] Uma operação "derruba toda sessão viva deste usuário", compartilhada pelos sites de ban, reset,
      troca de email e deleção
- [ ] O repositório de usuário para de soletrar colunas de sessão
- [ ] Teste que exercita a definição e a invalidação diretamente, além dos fluxos que já as cobrem
      por HTTP
- [ ] O teto de sessões vivas e a janela de graça da rotação continuam valendo, com os testes
      existentes verdes
- [ ] O glossário do domínio aponta para a definição única, em vez de descrevê-la em prosa sozinha
