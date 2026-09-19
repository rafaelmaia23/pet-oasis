# 23: Revisão final do guia de integração contra o código da fase

**What to build:** o front pode construir-se a partir de `apps/api/docs/guides/integrating-with-the-api.md`
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

**Status:** fechada em 2026-09-16

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

- [x] Os três erros reescritos: alias `api` só nas redes do projeto (com o porquê da omissão na
      `proxy`); assinatura local **e** releitura do usuário a cada request, com a consequência
      para o cliente nomeada; "email desconhecido e senha errada" no lugar de "as duas
      primeiras".
- [x] Seção de sessão ganha o bloco do cookie com o contrato completo e o parágrafo das duas
      saídas do BFF com o modo de falha silencioso do path.
- [x] Seção de descoberta diz onde cada rota mora (raiz do host vs `/api/v1`). Tabela de status
      ganha a linha do 413.
- [x] "nginx (Nginx Proxy Manager)" na primeira menção.
- [x] Nenhuma seção por-endpoint entra; nenhuma frase do que já confere é reescrita sem motivo.
- [x] Cada afirmação nova do guia foi conferida contra o código antes de escrita — o padrão desta
      revisão, não o da 10.6 (que escreveu o estado-alvo).
- [x] `docs:check` verde (o guia é citado de `src/` e do `deploy.md`; nenhuma âncora pode mudar
      sem os apontadores).

## O que foi feito

Um arquivo, `apps/api/docs/guides/integrating-with-the-api.md`; nenhuma seção nova, nenhuma âncora
mudada (a única citada de fora é a de CORS, em `apps/api/docs/adr/README.md#segurança`, e ficou intacta).

- **§1** — o alias `api` passou a ser descrito como das redes do projeto, com a omissão na `proxy`
  e o porquê (round-robin no DNS do Docker); "nginx (Nginx Proxy Manager)" na primeira menção.
- **§4** — linha do **413** na tabela de status (JSON acima do limite sem revelar o teto; imagem
  acima do máximo com o teto em MB no `action`). "As duas primeiras" virou "email desconhecido e
  senha errada", e a frase ganhou o 429 de lockout como mais um que só dispara com a senha certa —
  agora com `Retry-After`, verdadeiro desde a 22.
- **§5** — "sem consulta ao banco" virou "assinatura local, usuário relido a cada request", com a
  consequência nomeada (deleção mata o token na hora; perder role vale no request seguinte) e o
  aviso de não decodificar o JWT no cliente. Bloco do cookie em tabela: nome, `Path`, `HttpOnly`,
  `SameSite=Lax`, `Secure` só em produção, `Max-Age` de 7 dias deslizantes — cada atributo com a
  consequência para o cliente. Teto de sessões vivas (5 por padrão; o sexto login derruba a mais
  antiga, conferido em `createSessionAndEvictOldest`). Parágrafo do BFF com as duas saídas e o modo
  de falha do path.
- **§8** — `/openapi.json` e `/reference` marcados como raiz do host; `/me` grafado `/api/v1/me`.

Cada fato novo foi conferido no código antes de escrito: compose de produção (aliases), controller
e constantes de auth (cookie), middleware de autenticação (releitura), repository de auth
(eviction e `expiresAt` deslizante), error handler e middleware de upload (413), `routes/index.ts`
(montagem). `docs:check` verde.

**O que a revisão achou.** O item 1 (alias `api` fora da `proxy`) tinha sido conferido no compose
da **`dev`**, não no da branch: a `fase-10`, reaberta para o adendo, estava um commit atrás
(`063fb52`, ajuste pós-fecho que tirou o alias) — o texto era verdadeiro contra `dev`/`main` e
falso contra a base da própria branch. Correção: `dev` mergeada na `fase-10` antes de fechar, e o
alias reconferido no compose desta branch. Lição para o próximo adendo: **reabrir uma fase é
primeiro trazer a `dev` para ela.** A revisão também apontou que o porquê da omissão (round-robin
no DNS) não é matéria de guia — ficou uma frase e o ponteiro para `infrastructure.md` §10.1, que
já era o dono. Duas frases além do pedido, mantidas por serem transversais e curtas: "não
decodifique o JWT no cliente" e "o 429 de lockout também só vem com a senha certa" (esta corrige
uma ambiguidade real da tabela de recusas).
