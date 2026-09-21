# 16: Login e refresh dizem quando o access token expira

**What to build:** um cliente que faz `POST /auth/login` ou `POST /auth/refresh` recebe
`{ accessToken, expiresIn }` e sabe, sem decodificar o JWT e sem copiar a configuração da API,
quando precisa renovar — `expiresIn` é o número inteiro de segundos de validade, contado do
recebimento. A view dessa resposta é contrato: vive em `@pet-oasis/api-contracts`, a API a
importa (no OpenAPI e onde monta a resposta), e o web a tipa de lá. O guia de integração passa
a dizer que a expiração se lê deste campo, nunca do token. É a peça 2 da issue `00` da Fase 12,
absorvida aqui porque o pacote é que cresce, não o cliente.

**Blocked by:** 15.

**Status:** fechada em 2026-09-21

- [x] Teste HTTP primeiro: o 200 do login e o 200 do refresh trazem `expiresIn` inteiro,
      positivo, coerente com a configuração de validade do access token (que continua no formato
      atual, `"15m"`; a conversão para segundos é da API). O par de refresh reapresentado na
      janela de graça devolve o mesmo `expiresIn` que o par emitido. A coerência é provada
      contra o próprio token (`expiresIn === exp − iat`), no HTTP e no unitário de
      `lib/accessToken` — decodificar no teste da emissora é legítimo; o que o guia proíbe é
      o cliente.
- [x] A view (`{ accessToken, expiresIn }`) é exportada pelo contrato, no domínio de auth,
      como `accessTokenViews` — nome pelo termo do glossário e pelo id `AccessToken` que o
      OpenAPI já usava, não "sessão", que no glossário é a linha do refresh; o schema local do
      OpenAPI da API deixou de existir e o documento referencia a view do contrato — o teste
      de integração do `/openapi.json` continuou verde sem edição. Um `accessTokenPresenter`
      monta o corpo, como toda outra resposta.
- [x] `expiresIn` deriva da **mesma** fonte que assina o token — `ACCESS_TOKEN_TTL_SECONDS`
      em `lib/accessToken.ts`, lido de `JWT_EXPIRES_IN` pelo mesmo parser (`ms`, agora
      dependência direta da API) e com o mesmo `floor` do `jsonwebtoken`; string inválida
      derruba o boot. Racional em `apps/api/docs/adr/0200`.
- [x] Guia de integração, seção de sessão e renovação: documenta `expiresIn`, diz que o BFF
      calcula o prazo a partir dele (renovando 60 s antes) e que decodificar o JWT para isso é
      proibido; `reference/endpoints.md` atualizado nas linhas de login e refresh; glossário
      da API e README do contrato mencionam o campo.
- [x] Issue `00` da Fase 12 fechada: seus critérios apontam para esta issue e para a 17.
- [x] Suíte, `typecheck`, `lint` e `docs:check` verdes.
