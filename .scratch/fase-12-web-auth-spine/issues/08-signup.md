# 08: Cadastro

**What to build:** um visitante cria a própria conta e sai sabendo que o processo ainda não
terminou — falta verificar o email.

**Blocked by:** 00, 05

**Status:** ready-for-agent

- [ ] Formulário com os campos que o `signupSchema` do contrato exige — e validado por ele,
      antes do envio; a validação que decide continua sendo o 422 da API
- [ ] O telefone aceita máscara livremente; a API normaliza descartando o que não é dígito
- [ ] Os requisitos da senha são visíveis **antes** de a pessoa errar
- [ ] Erro de validação aparece no campo correspondente, nunca em aviso flutuante
- [ ] Email ou CPF já em uso é comunicado sem ambiguidade
- [ ] Excesso de tentativas de cadastro mostra quanto tempo esperar
- [ ] O sucesso leva a uma confirmação que diz claramente que **falta verificar o email**
- [ ] A tela funciona em tela pequena e nos dois temas
- [ ] Erros são anunciados a leitor de tela
- [ ] E2E cria uma conta nova e chega até a confirmação
