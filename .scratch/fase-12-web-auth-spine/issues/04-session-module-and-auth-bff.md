# 04: Módulo de sessão e BFF de autenticação

**What to build:** a capacidade de criar, ler e destruir uma sessão, e os endereços próprios
do front que fazem o proxy da autenticação. O navegador nunca fala com a API para autenticar,
e os tokens nunca chegam ao JavaScript da página.

Este ticket **não tem interface**. Ele é verificável pela costura 2, não demoável. A tela
que o usa é o ticket 05.

A rotação proativa **não** entra aqui: `ensureFreshSession` existe com a assinatura final,
mas devolve a sessão inalterada. O comportamento de renovação é o ticket 07 — expandir
primeiro, implementar depois.

**Blocked by:** 00, 03

**Status:** ready-for-agent

- [ ] Módulo de sessão com a interface acordada: criar, ler, destruir e garantir sessão fresca
- [ ] **Relógio e cliente da API entram por injeção.** Nenhuma dependência global dentro do
      módulo — é o que torna a costura 2 possível
- [ ] Sessão persistida em cookie `httpOnly` **criptografado**, do domínio do front
- [ ] O cookie contém apenas o access token, o refresh token, a **validade do access token**
      (lida da resposta da API, nunca do JWT) e o identificador do `User`. A **capability
      efetiva** nunca é persistida
- [ ] O refresh token é lido do `Set-Cookie` da resposta da API e **nunca repassado ao
      navegador**: o BFF é o único portador, e o reenvia como `Cookie` em `/auth/refresh` e
      `/auth/logout` (a API só o lê sob `/api/v1/auth`)
- [ ] O cookie do web vale **7 dias deslizantes**, renovado a cada refresh — expira junto com
      o refresh da API
- [ ] Endereços próprios do front para entrar e sair, proxiando a API
- [ ] Sair encerra a sessão **também no servidor da API**, não apenas apaga o cookie — o
      `POST /auth/logout` da API lê o refresh do cookie que o BFF reenvia
- [ ] Credencial recusada devolve a condição que a API informou, identificada pelo `code` do
      envelope de erro e **nunca** por casamento da `message` em pt-BR
- [ ] Testes na costura 2 cobrem criar, ler, destruir e o conteúdo do cookie — inclusive que
      o refresh e a validade estão lá, e que nada da API é repassado ao navegador
- [ ] Um teste prova que a capability efetiva não está no cookie
- [ ] Nenhum teste afirma sobre a estrutura interna do módulo
