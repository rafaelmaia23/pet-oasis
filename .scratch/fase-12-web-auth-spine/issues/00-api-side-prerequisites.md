# 00: Pré-requisitos do lado da API — o contrato precisa de mais duas peças, e o guia de uma

**What to build:** nada neste repositório. Esta issue existe para que dois buracos do
`@pet-oasis/api-contracts` e um do guia de integração, descobertos ao alinhar a spec ao guia
da API, não sejam esquecidos — e para que nenhuma issue desta fatia comece antes de eles estarem
fechados. O primeiro ato dela, já dentro do monorepo, é abrir as issues correspondentes no
`.scratch/` da raiz, do lado da API.

**Blocked by:** None — mas só existe depois do import (issue 11 do monorepo), porque o
trabalho é no pacote, e o pacote vive lá.

**Status:** fechada em 2026-09-21 — o trabalho vive nas issues 16 e 17 da Fase 11

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

- [x] Issue aberta no `.scratch/` da raiz para a tabela de rotas no contrato, com OpenAPI
      derivado dela e teste de paridade com o router — é a issue 17 da Fase 11
      (2026-09-21)
- [x] Issue aberta para a resposta de login/refresh (com validade) no contrato — é a
      issue 16 da Fase 11, com `expiresIn` em segundos (2026-09-21)
- [x] O guia de integração documenta o campo de validade e a regra "leia daqui, não do JWT" —
      feito na issue 16 da Fase 11 (§ 5 do guia; racional em `apps/api/docs/adr/0200`)
      (2026-09-21)
- [x] Spec da Fase 11 revista na fronteira do contrato ("Revisto em 2026-09-21")
- [ ] As duas fechadas: o `typecheck` do web passa importando a tabela de rotas e a view de
      login do contrato — a view (`accessTokenViews`) existe desde a issue 16 (2026-09-21); a
      tabela e a prova no web são critério da issue 17 da Fase 11, que é quem marca este item.
      Esta issue está fechada porque seu trabalho — abrir as duas issues e o item do guia —
      terminou; este critério sobrevive a ela, na 17.
