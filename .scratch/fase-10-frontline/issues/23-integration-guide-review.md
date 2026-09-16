# 23: Revisão final do guia de integração contra o código da fase

**What to build:** o front pode construir-se a partir de `docs/guides/integrating-with-the-api.md`
sem descobrir por 401 o que o guia devia ter dito. A revisão final da fase (2026-09-16), feita
afirmação por afirmação contra o código, achou **três erros** — coisas que o guia afirma e a API
não faz — e **duas lacunas** — contrato que o front precisa e o guia não menciona. O resto
(redes, `X-Forwarded-For`, CORS, os três `code`s de login e a ordem, janela de 10 s + marca de
30 s, as quatro rotas de email, imagens) confere.

O guia **continua transversal** (como alcançar a API, o que esperar, sessão, links de email,
imagens). Nada por-endpoint entra: isso já tem duas fontes mantidas (OpenAPI e `endpoints.md`),
e um terceiro lugar é um terceiro lugar para envelhecer.

**Blocked by:** 22 — o guia afirma `Retry-After` no 429 de lockout, e a frase só é verdade
depois da 22. Escrever antes seria documentar promessa.

**Status:** ready-for-agent

**Decisões (usuário, 2026-09-16):**

- Cookie descrito por **contrato completo**, não por resumo: cada atributo muda código no BFF
  (path errado = cookie nunca enviado; `Secure` = só https; teto de sessões = "por que meu
  celular deslogou").
- O guia **orienta** o BFF sobre o cookie, além de descrever: nomeia as duas saídas — repassar o
  `Set-Cookie` ao navegador (e aí o path da rota do BFF que renova precisa casar com o do cookie)
  ou guardar o refresh numa sessão própria e nunca expor — e o único jeito de a primeira quebrar
  em silêncio (path que não casa → cookie nunca reenviado → todo refresh dá 401 "sem motivo",
  15 minutos depois de "estar funcionando"). Quem escolhe continua sendo o front.

## Os três erros

1. **"`api` … registrado como alias de rede em toda rede que ele integra"** — o alias existe só
   nas redes do projeto (`backend`, `pet-oasis`); na `proxy`, compartilhada com todo projeto
   atrás do NPM, ele é **omitido de propósito** (dois aliases iguais viram round-robin no DNS do
   Docker). O compose de produção e o guia de deploy já dizem isso; o guia de integração mente.
2. **"Validado localmente pela API (sem consulta ao banco)"** — a assinatura é verificada
   localmente, mas o usuário é **relido a cada request**: é o que mata o token de conta deletada
   na hora e o que faz as features serem sempre frescas. Um front que leia o guia presume que
   deleção ou perda de role demora 15 minutos para valer.
3. **"As duas primeiras são deliberadamente indistinguíveis entre si"** — lê-se como "401 e 429";
   quer dizer "email desconhecido e senha errada". (A afirmação de `Retry-After` no 429 de
   lockout era o terceiro erro e deixa de ser com a 22 — fica, agora verdadeira.)

## As duas lacunas

4. **O refresh token é cookie.** O guia diz "token opaco, rotativo" e nunca diz que ele viaja em
   cookie `HttpOnly`: nome, path escopado ao grupo de rotas de auth, `SameSite=Lax`, `Secure`
   em produção, 7 dias deslizantes; login e refresh devolvem **só** o access token no corpo;
   refresh e logout leem o cookie; teto de sessões vivas por usuário (a mais antiga cai). A
   issue 18 fundamentou uma decisão em "o refresh token é cookie" — o guia deveria dizer.
5. **`/openapi.json` e `/reference` ficam na raiz do host, não sob `/api/v1`**; `/me` fica sob
   `/api/v1`. A seção de descoberta não distingue, e a seção 1 só apresentou a base com
   `/api/v1`. Junto: a tabela de status **não tem o 413** (corpo acima do limite e imagem acima
   do tamanho máximo — a resposta da imagem diz o teto em MB), e o front faz upload.

## Menor

6. O guia diz "nginx"; o proxy real é o Nginx Proxy Manager, e o guia de deploy já o chama de
   NPM. Uma menção "(Nginx Proxy Manager)" na primeira ocorrência basta.

## Critérios

- [ ] Os três erros reescritos: alias `api` só nas redes do projeto (com o porquê da omissão na
      `proxy`); assinatura local **e** releitura do usuário a cada request, com a consequência
      para o cliente nomeada; "email desconhecido e senha errada" no lugar de "as duas
      primeiras".
- [ ] Seção de sessão ganha o bloco do cookie com o contrato completo e o parágrafo das duas
      saídas do BFF com o modo de falha silencioso do path.
- [ ] Seção de descoberta diz onde cada rota mora (raiz do host vs `/api/v1`). Tabela de status
      ganha a linha do 413.
- [ ] "nginx (Nginx Proxy Manager)" na primeira menção.
- [ ] Nenhuma seção por-endpoint entra; nenhuma frase do que já confere é reescrita sem motivo.
- [ ] Cada afirmação nova do guia foi conferida contra o código antes de escrita — o padrão desta
      revisão, não o da 10.6 (que escreveu o estado-alvo).
- [ ] `docs:check` verde (o guia é citado de `src/` e do `deploy.md`; nenhuma âncora pode mudar
      sem os apontadores).
