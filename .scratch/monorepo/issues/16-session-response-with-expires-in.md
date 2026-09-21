# 16: Login e refresh dizem quando o access token expira

**What to build:** um cliente que faz `POST /auth/login` ou `POST /auth/refresh` recebe
`{ accessToken, expiresIn }` e sabe, sem decodificar o JWT e sem copiar a configuração da API,
quando precisa renovar — `expiresIn` é o número inteiro de segundos de validade, contado do
recebimento. A view dessa resposta é contrato: vive em `@pet-oasis/api-contracts`, a API a
importa (no OpenAPI e onde monta a resposta), e o web a tipa de lá. O guia de integração passa
a dizer que a expiração se lê deste campo, nunca do token. É a peça 2 da issue `00` da Fase 12,
absorvida aqui porque o pacote é que cresce, não o cliente.

**Blocked by:** 15.

**Status:** ready-for-agent

- [ ] Teste HTTP primeiro: o 200 do login e o 200 do refresh trazem `expiresIn` inteiro,
      positivo, coerente com a configuração de validade do access token (que continua no formato
      atual, `"15m"`; a conversão para segundos é da API). O par de refresh reapresentado na
      janela de graça devolve o mesmo `expiresIn` que o par emitido.
- [ ] A view de sessão (`{ accessToken, expiresIn }`) é exportada pelo contrato, no domínio de
      auth; o schema local do OpenAPI da API deixa de existir e o documento referencia a view
      do contrato — o teste de integração do `/openapi.json` continua verde sem edição.
- [ ] `expiresIn` deriva da **mesma** fonte que assina o token — uma configuração só, sem
      segunda constante.
- [ ] Guia de integração, seção de sessão e renovação: documenta `expiresIn`, diz que o BFF
      calcula o prazo a partir dele (renovando 60 s antes) e que decodificar o JWT para isso é
      proibido; o guia de endpoints da API (se listar a resposta do login) atualizado.
- [ ] Issue `00` da Fase 12 fechada: seus critérios apontam para esta issue e para a 17.
- [ ] Suíte, `typecheck`, `lint` e `docs:check` verdes.
