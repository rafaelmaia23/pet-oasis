# 06: O módulo `VerificationToken`: emitir e consumir

**What to build:** o token de verificação passa a ser uma coisa só no código, como já é no
glossário: opaco, uso único, hasheado em repouso, com `purpose` e expiração. Hoje cada purpose
reconstrói a sequência — cinco sites de emissão, quatro transações de consumo — e o predicado de
validade está retipado verbatim quatro vezes. Uso único é imposto em oito lugares independentes:
tirar uma cláusula de um deles transforma aquele token numa credencial replayável, e nada
estrutural percebe.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Um módulo com **emitir** e **consumir**, parametrizado por `purpose` e TTL
- [ ] O consumo recebe o efeito colateral do purpose e o roda **dentro** da mesma transação que
      marca o token como usado
- [ ] As quatro transações de consumo do repositório colapsam em uma
- [ ] O serviço de cada purpose sobrevive como arquivo — perde o boilerplate, mantém a orquestração
      (exigência de ADR-0072 da API)
- [ ] A escrita de auditoria transacional continua no repositório (ADR-0098 da API)
- [ ] Teste unitário do consumo contra token desconhecido, já usado, expirado e de purpose errado
- [ ] Um teste de integração por purpose continua provando o efeito colateral; nenhum é apagado
- [ ] O 400 genérico de token inválido continua genérico (ADR-0071 da API): nada no corpo distingue
      "não existe" de "expirado"
