# 00: Pré-requisitos do lado da API — o contrato precisa de mais duas peças, e o guia de uma

**What to build:** nada neste repositório. Esta issue existe para que dois buracos do
`@pet-oasis/api-contracts` e um do guia de integração, descobertos ao alinhar a spec ao guia
da API, não sejam esquecidos — e para que nenhuma issue desta fatia comece antes de eles estarem
fechados. O primeiro ato dela, já dentro do monorepo, é abrir as issues correspondentes no
`.scratch/` da raiz, do lado da API.

**Blocked by:** None — mas só existe depois do import (issue 11 do monorepo), porque o
trabalho é no pacote, e o pacote vive lá.

**Status:** ready-for-human

## Por que é da API, e não do web

O pacote de contratos é "o que atravessa a rede". Se ele não basta para um cliente consumi-lo,
é o pacote que cresce: uma tabela de rotas escrita no web seria a **terceira** cópia do mesmo
path (router Express, `apps/api/src/docs/paths/*.ts`, web), que é exatamente a duplicação que o
monorepo existe para eliminar.

## As duas peças

1. **A tabela de rotas no contrato.** Hoje ela existe em `apps/api/src/docs/paths/*.ts`,
   tipada com `ZodOpenApiPathsObject`: path + verbo → `fromEnvelope(schema)` → views de
   resposta → erros. Precisa viver no pacote, por domínio, numa forma **só-zod**
   (`{ method, path, request, responses }`) — sem `zod-openapi`, que é da API. Onde a resposta
   varia por capability (escada `public`/`internal`/`cost`), a entrada lista as views
   possíveis. O `src/docs/` da API passa a **derivar** o OpenAPI dessa tabela: o adaptador com
   `fromEnvelope`/`jsonResponse`/`zod-openapi` fica na API, do mesmo jeito que o
   `createPresenter` fica. Prova, no molde do `enumParity.test.ts`: um teste na API compara o
   router stack do Express com a tabela — rota registrada sem entrada, ou entrada sem rota, é
   teste vermelho.
2. **A resposta de login e refresh no contrato, com a validade do access token.**
   `accessTokenSchema` (`{ accessToken }`) hoje é definido no arquivo de docs da API, não no
   pacote — o web não teria de onde tipar a resposta do login. E a resposta não diz quando o
   access token expira: o BFF renova 60 segundos antes, e o guia proíbe decodificar o JWT para
   decidir. O nome do campo é da API (`expiresIn`, `expiresAt`, o que ela preferir); o contrato
   o tipa.

## O buraco no guia de integração

O guia (`apps/api/docs/guides/integrating-with-the-api.md`, § 5 "Sessão e renovação") diz
que o access token vive 15 minutos e que o cliente **não deve decodificar o JWT para decidir
nada** — mas não diz **como** o cliente descobre quando o token expira. Hoje a única saída
seria justamente decodificar o `exp`, ou duplicar o `JWT_EXPIRES_IN` da API no cliente. É o
caso que o `CLAUDE.md` do web chama de "o que faltar lá é buraco no guia": o guia precisa
crescer junto com a peça 2 — documentar o campo de validade na resposta de login/refresh e
dizer que é dele, e não do JWT, que o cliente lê a expiração.

## O que isto pede da spec do monorepo

A seção "O que é contrato" da spec da Fase 11 fecha a fronteira do pacote sem a tabela de
rotas. Isto a alarga — é revisão dela (entrada "Revisto em"), não adição silenciosa.

- [ ] Issue aberta no `.scratch/` da raiz para a tabela de rotas no contrato, com OpenAPI
      derivado dela e teste de paridade com o router
- [ ] Issue aberta para a resposta de login/refresh (com validade) no contrato
- [ ] O guia de integração documenta o campo de validade e a regra "leia daqui, não do JWT"
- [ ] Spec da Fase 11 revista na fronteira do contrato
- [ ] As duas fechadas: o `typecheck` do web passa importando a tabela de rotas e a view de
      login do contrato
