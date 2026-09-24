# Spec — Profundidade nos módulos da API e do contrato

Status: ready-for-agent

O primeiro dos dois **esforços** da Fase 12, e ele vem antes por dependência: muda exatamente o
que o esforço `fase-12-web-auth-spine` vai consumir (`.scratch/fase-12-web-auth-spine/`). A forma
"uma fase, um ou mais esforços" é de `docs/adr/0002-tracker-folders-are-phases.md`.

Nasce de uma revisão de arquitetura conduzida em 2026-09-22 (skill `improve-codebase-architecture`,
nove candidatos) e da grelha de 2026-09-23 que fechou o escopo. O vocabulário de arquitetura é o da
skill `codebase-design` — **module** (qualquer coisa com interface e implementação), **interface**
(tudo que quem chama precisa saber: tipos, invariantes, ordem, modos de erro, configuração),
**depth** (comportamento por unidade de interface), **shallow**, **seam** (o lugar onde se altera
comportamento sem editar ali), **adapter**, **leverage**, **locality**. O vocabulário de domínio é
o de `apps/api/CONTEXT.md`, sem termo novo: esta spec não cria domínio.

---

## Problem Statement

A API está completa, no ar e coberta por fora: 79 rotas, e uma suíte de integração de ~21 mil
linhas que prova o comportamento por HTTP. Por dentro, porém, várias invariantes que o glossário
nomeia **como uma coisa só** existem no código **em cópia** — e uma cópia divergente não é um
detalhe de estilo, é a única forma de esta API regredir sem ninguém ver.

O que a revisão mediu, com contagem e não estimativa:

- **O `VerificationToken` não tem módulo.** O glossário descreve um token opaco, de uso único,
  hasheado em repouso, com `purpose` e expiração. No código cada purpose reconstrói a sequência: 5
  sites de emissão, 4 transações de consumo, e o predicado de validade (`purpose` errado ·
  `usedAt` não nulo · expirado) retipado **verbatim 4 vezes**. Uso único é imposto em oito lugares
  independentes; tirar uma cláusula de um deles transforma aquele token numa credencial
  replayável.
- **"Sessão viva" tem duas grafias.** O glossário diz que é um conjunto só — o que
  `GET /auth/sessions` lista é o que ban, reset e troca de email derrubam. No código, 5 sites usam
  as três cláusulas e **3 sites de invalidação omitem `usedAt`**. Hoje a divergência é benigna na
  direção (o frouxo derruba mais), mas os dois conjuntos não são o mesmo, e o próximo site de
  escrita é cara ou coroa.
- **A política do cookie de refresh vive em quatro expressões** do controller de auth: dois blocos
  de seis atributos idênticos, três leituras com cast, um `clearCookie` com o path repetido à mão.
  Os atributos são afirmados por **um** teste, no login — o `refresh` pode perder `httpOnly` ou
  `sameSite` e a suíte fica verde. `secure` em produção não é alcançado por nenhum teste.
- **Cada rota é declarada três vezes.** A tabela de rotas do contrato promete método, path,
  request, resposta, erro por status e exigência de auth (`docs/adr/0003-route-table-is-contract-openapi-is-derived.md`),
  mas só método e path são load-bearing: o teste de paridade compara **apenas** o par
  `MÉTODO path`, e o controller re-declara o schema (69 chamadas de `.parse`), o status e a view. A
  tabela é hoje um **seam com um adapter só** — o documento OpenAPI; nenhum módulo de
  `apps/api/src/modules/` a importa.
- **A drift já está publicada.** `DELETE /users/:id/ban` declara `{401,403,404,409}` e responde
  **422** a um uuid inválido — a própria suíte de integração exige esse 422. O `POST` no mesmo path
  declara 422, prova de que a lista é mantida à mão. **14 das rotas com `:param` omitem o 422** que
  produzem.
- **`ERROR_CODES` do contrato tem zero consumidores na API.** Grep de `ERROR_CODES`, `ErrorCode` e
  `errorResponseSchema` em `apps/api` (fonte e testes) retorna **zero**. São 15 codes no contrato
  contra 12 classes de erro, `AppError.code` é `string`, três codes viajam como string nua no
  serviço de auth, e o 409 do `P2002` monta o envelope à mão — uma quarta grafia. O esforço do web
  precisa ramificar por `code`, e **nada prova** que o code emitido pertence ao enum.
- **"Autorizar antes de buscar" é hábito, não estrutura.** `apps/api/docs/adr/0011-autorizacao-sempre-antes-busca.md`
  é uma invariante de segurança (buscar primeiro conta a quem não tem `:others` se o id existe).
  Cada serviço a reescreve à mão, com o nome da feature digitado em prosa — e `getUserByEmail` faz
  o **inverso**, exatamente o vazamento que o ADR proíbe. Tem zero callers e zero testes: um guard
  que ninguém alcança é um guard cujo erro ninguém viu.
- **`audit` é opt-in de quem chama.** 35 assinaturas de repositório carregam
  `audit?: AuditDescriptor` e 13 repetem o mesmo corpo de dois braços (escrita simples × transação
  com `record`). Uma chamada nova que esquece o argumento grava estado sem rastro, e é
  indistinguível de um no-audit deliberado.
- **"Qual view este viewer recebe" não tem dono.** A escada (*ladder*) é declarada no contrato como
  um array de schemas e a feature que destrava cada passo é **prosa**. A API restata o mapa em
  camadas diferentes por recurso — controller no `user`, serviço no `product`, inline no
  `audit-log` — e `viewFor` está duplicado verbatim entre produto e variante. O comentário do
  próprio serviço de produto documenta o perigo (o filtro da lista e a view escolhida não podem
  divergir) e depois confia nos dois callers lembrarem.
- **A tabela não tem teste no pacote que a possui.** Nenhum dos 6 arquivos de teste de
  `packages/api-contracts` menciona as rotas; o que existe é um teste unitário na API que faz
  monkey-patch do router do Express e um de integração que sobe a aplicação. Invariantes que são
  **funções puras** da tabela hoje só falham com Postgres em pé. Os 18 grupos usam
  `satisfies RouteGroup` sem `as const`, então `path` é `string` e não literal — justamente o que o
  cliente HTTP do web precisaria que o typecheck alcançasse.

E há um bloqueio operacional que atravessa tudo: o remoto é HTTPS com askpass de GUI e `gh` não
está instalado, então quem trabalha via agente **não consegue dar push nem abrir PR** — cada
entrega precisa de uma mão humana no meio.

## Solution

Nove aprofundamentos, um por friction, cada um dando **um dono** a uma invariante que hoje vive em
cópia — mais a configuração de acesso ao GitHub que destrava a entrega. Em vocabulário de design:
cada candidato troca uma interface larga com implementação fina (**shallow**) por uma interface
pequena com a implementação absorvida (**deep**), e coloca o seam onde o teste já quer estar.

Comportamento externo **não muda**, com **uma exceção anunciada**: o `/openapi.json` passa a
declarar os status que a API já responde (o 422 em 14 rotas). Nenhuma regra de negócio é decidida
aqui — nenhum status novo, nenhuma validação nova, nenhuma política de acesso alterada.

O ganho, em ordem de importância:

1. **Locality** — uso único de token, definição de sessão viva, política do cookie, ordem
   autorizar-antes-de-buscar, vocabulário de erro e a regra transacional da auditoria passam a ter
   um lugar cada. Consertar passa a consertar em todo lugar.
2. **Leverage** — 79 rotas, 69 `.parse` e a lista de erros de cada rota passam a sair de uma
   travessia da tabela; o cliente HTTP do esforço do web ganha `path` literal, `code` tipado e uma
   política de cookie única para espelhar no BFF.
3. **Test surface** — o que hoje só falha com banco e aplicação de pé passa a falhar como função
   pura: consumo de token, escolha de view, atributos de cookie, invariantes da tabela.

## User Stories

1. Como quem mantém a API, quero que "uso único" do `VerificationToken` exista num lugar só, para
   que adicionar um quinto `purpose` não signifique copiar sessenta linhas e rezar.
2. Como quem mantém a API, quero que apresentar um token já usado seja recusado pela mesma
   implementação em todos os purposes, para que nenhum fluxo fique replayável por omissão.
3. Como quem mantém a API, quero que o efeito colateral de cada purpose rode dentro da mesma
   transação que marca o `usedAt`, para que um erro no efeito não deixe o token queimado sem a
   ação ter acontecido.
4. Como quem mantém a API, quero uma definição só de **sessão viva**, para que o que
   `GET /auth/sessions` lista seja exatamente o que ban, reset e troca de email derrubam — por
   construção, não por três literais coincidentes.
5. Como quem lê o glossário, quero que o termo "sessão viva" aponte para um lugar do código, para
   que a definição em prosa e a do banco não possam divergir em silêncio.
6. Como quem mantém a API, quero que os atributos do cookie de refresh sejam decididos num módulo
   só, para que `httpOnly`, `sameSite` e `secure` não dependam de dois blocos permanecerem iguais.
7. Como quem mantém a API, quero poder testar o cookie contra um `res` falso, para que `secure` em
   produção deixe de ser a única propriedade de segurança que nenhum teste alcança.
8. Como quem escreve o BFF do web, quero uma única fonte da política do cookie de sessão, para que
   o cookie do web e o da API não precisem ser mantidos iguais de cabeça.
9. Como quem escreve o cliente HTTP do web, quero `path` tipado como literal na tabela de rotas,
   para que montar a URL de uma rota com `:param` seja verificado pelo compilador.
10. Como quem escreve o cliente HTTP do web, quero que o `code` do erro venha de um enum
    compartilhado, para que eu ramifique por `code` com `switch` exaustivo e nunca por casamento de
    mensagem.
11. Como quem escreve o cliente HTTP do web, quero a lista de status possíveis de cada rota
    completa no contrato, para que meu tratamento de erro não seja surpreendido por um 422 não
    declarado.
12. Como quem consome o `/openapi.json` (coleção Bruno, cliente gerado), quero que o documento
    declare os status que a API de fato responde, para que a documentação pare de omitir o 422 de 14
    rotas.
13. Como quem consome o `/openapi.json`, quero que essa correção chegue num commit único e
    anunciado, para que eu saiba exatamente o que mudou e possa revertê-lo isolado.
14. Como quem mantém a API, quero que a lista de erros de uma rota seja **derivada** do que o
    schema e o middleware podem produzir, para que declarar status pare de ser trabalho manual que
    envelhece.
15. Como quem mantém a API, quero que uma rota seja declarada num lugar só, para que adicionar rota
    deixe de significar "edite três arquivos e espere que concordem".
16. Como quem mantém a API, quero que o teste de paridade de rotas deixe de ser load-bearing, para
    que a concordância entre contrato e router seja estrutural em vez de vigiada por monkey-patch
    do Express.
17. Como quem mantém o contrato, quero que os invariantes da tabela (todo `:param` tem chave em
    `params`, o envelope só usa `body`/`params`/`query`, as tags casam com as do documento, a escada
    é contida) sejam provados dentro do pacote que possui a tabela, para que eles falhem sem
    Postgres e sem aplicação de pé.
18. Como quem mantém a API, quero que autorizar-antes-de-buscar seja uma primitiva, para que a
    ordem não possa ser invertida num call site novo.
19. Como dono do produto, quero que o único ponto que hoje inverte essa ordem seja removido, para
    que não exista caminho — mesmo inalcançável — que conte a existência de um id a quem não pode
    vê-lo.
20. Como quem mantém a API, quero que o `action` do 403 seja derivado da feature exigida, para que
    o corpo do erro pare de ter o nome da feature digitado em prosa em cada site.
21. Como quem mantém a API, quero que uma escrita auditável declare o descriptor em vez de
    recebê-lo como opcional, para que "sem rastro" tenha de ser escrito, não omitido.
22. Como quem mantém a API, quero a regra "com transação a falha de auditoria desfaz a ação; sem
    transação, não" num lugar só, para que ela pare de ser alcançável apenas por treze cópias do
    mesmo `if`.
23. Como quem mantém a API, quero que o mapa passo-da-escada → feature seja declarado uma vez, para
    que o filtro de uma listagem e a view escolhida não possam divergir.
24. Como quem revisa um PR, quero que o mapa feature → view seja testável numa tabela, porque é a
    parte que vaza dado quando erra.
25. Como agente trabalhando neste repo, quero entender "como se lê uma feature" ou "quem decide a
    view" sem saltar entre cinco arquivos, para que um contexto novo alcance a resposta.
26. Como quem mantém a API, quero que nenhum teste de integração seja apagado neste esforço, para
    que a prova de não-regressão sobreviva ao próprio refactor.
27. Como quem trabalha via agente, quero `gh` instalado e autenticado, para que push e PR deixem de
    exigir uma mão humana em cada entrega.
28. Como dono do repositório, quero decidir entre `gh auth setup-git` e chave SSH, para que a forma
    de acesso ao remoto seja escolha minha e não default de ferramenta.

## Implementation Decisions

### Escopo e ordem

- Os **nove candidatos** entram inteiros neste esforço, mais a configuração do `gh`. Total: **19
  issues**, em ordem de dependência. A `01` é o `gh` e **não bloqueia nenhuma outra** — o esforço
  corre inteiro sem ela, com push e PR manuais. O desenho aprovado na grelha tinha 18: a issue a
  mais é o **contract** do refactor largo das rotas (apagar a forma velha de registrar), que a
  disciplina expand–contract exige como ticket próprio, bloqueado por todos os lotes de rota — do
  contrário ele viajaria escondido dentro do último lote.
- As 7 issues de rota migram **todas as 79 rotas** neste esforço, com **um commit por rota**, em
  grupos temáticos: piloto (status, me, log, audit-log, breed — 5) · role/feature/permission (11) ·
  auth (14) · user/profile (14) · pet (10) · brand/category/tag (14) · product/variant (11).
- O registrador **convive** com a forma antiga de registrar rota até o último grupo migrar; a issue
  que fecha o bloco apaga a forma velha e o monkey-patch do teste de paridade. Não fica forma dupla
  no repo depois do esforço.

### A única interface que esta spec fixa: o registrador de rota

Sete issues dependem dela, então ela não pode ser renegociada na segunda. Tudo o mais é decidido na
issue, teste primeiro.

```ts
// O registrador recebe a entrada da tabela e o caso de uso; deriva path, parse do envelope,
// status de sucesso e view. Middleware de servidor entra por parâmetro — a tabela não os conhece.
registerRoute(router, routes.user.unban, {
  before: [authenticate, canAccess("manage:user:status")],
  handler: async ({ params, body, query, actor }) => { /* devolve o que a view descreve, ou void */ },
});
```

- A entrada da tabela é a **fonte** de método, path, schema de request, status de sucesso e view. O
  handler recebe o envelope **já validado** e devolve dado (ou nada, no 204) — ele não toca `res`.
- O que é do servidor e **não** entra na tabela: `authenticate`/`optionalAuthenticate`,
  `canAccess`, `rateLimitByIp`, upload de imagem. Eles são parâmetro do registro, na ordem em que
  já rodam hoje.
- A tabela ganha um **segundo adapter** dentro da API (hoje só o documento OpenAPI a consome). É o
  que `docs/adr/0003-route-table-is-contract-openapi-is-derived.md` já implica e a API ainda não
  honrava.
- `buildPath` **não** se move para o contrato — decisão do 0003, preservada. O que muda é só o
  **tipo** de `path`: `as const` nos 18 grupos o torna literal.

### Duas consequências do registrador, descobertas na issue 08 e válidas para as issues 09–15

Anotadas aqui, e não na issue 08 que as descobriu, porque é aqui que as seis issues de rota
seguintes as encontram.

- **O `authenticate` desce do prefixo para a rota, e com ele um 401 vira 404 — decidido, siga.**
  Antes, `v1Router.use("/me", authenticate, meRouter)` autenticava tudo que caísse sob o prefixo,
  inclusive o que não é rota: um método inexistente sob `/me` respondia 401. Com o registrador, o
  router é montado sem prefixo (o path inteiro vem da tabela) e só a rota declarada autentica — o
  mesmo request responde 404. **É a única exceção ao "comportamento externo não muda" que esta
  spec não previa**, e vale para todo prefixo conforme ele migra (`/users`, `/pets`, `/variants`,
  `/features`, `/roles`, `/customers/:customerId`). O dono do projeto decidiu pelo 404 em
  2026-09-23; o porquê — a lista de rotas já é pública no `/openapi.json`, então o 404 não revela
  nada — está em
  `apps/api/docs/adr/0203-authenticate-desce-do-grupo-para-rota-404-vence-401.md`. Nenhuma issue
  de rota precisa reabrir isto.
- **Presenter que fica sem chamador sai.** O *Out of Scope* abaixo diz que os 13 `*.presenter.ts`
  não são tocados, e o que ele protege é o **mecanismo** de whitelist que o
  `apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md` fixou — esse
  sobrevive inteiro, agora em `presentWith` (`apps/api/src/utils/presenter.ts`), com dois
  chamadores. Um `*.presenter.ts` que era só `createPresenter(views)` fica sem chamador quando a
  view passa a vir da tabela, e apagá-lo é consequência da migração, não refactor do mecanismo. O
  que **não** sai é o que decide conteúdo em vez de forma: o `maskIp` do audit log é o caso vivo.

### Erro

- `AppError.code` passa a ser o `ErrorCode` do contrato, e as 12 classes tiram o code de lá. O 409
  do `P2002` deixa de montar o envelope à mão e passa pelo mesmo caminho.
- Os três codes que hoje viajam como string nua no serviço de auth entram no enum ou se
  justificam nele — o contrato passa a ser a **interface** e a API a implementação, em vez de duas
  declarações paralelas. `apps/api/docs/adr/0095-fronteira-featurename-string.md` sustenta o corte:
  o code já é literal digitado à mão.
- A lista de erros por rota passa a ser **derivada** do que o schema e o middleware produzem, com
  um teste que proíbe o documento de sub-declarar. A mudança visível do `/openapi.json` fica **numa
  issue e num commit**, separada da migração das rotas.

### Identidade e sessão

- Um módulo de `verificationToken` com **issue** e **consume**, parametrizado por `purpose` e TTL,
  recebendo o efeito colateral para rodar dentro da transação do consume. Os 4 `consume*` do
  repositório colapsam em um. O serviço por purpose **sobrevive** como arquivo — exigência de
  `apps/api/docs/adr/0072-orquestracao-vive-verification-service-ts-nao-auth.md` —, perdendo o
  boilerplate e mantendo a orquestração. A escrita transacional de auditoria continua no
  repositório (`apps/api/docs/adr/0098-gravacao-transacional-audit-vive-repository-service.md`).
  Este é o lado que faltava de `apps/api/docs/adr/0069-verificationtoken-generico-purpose.md`.
- Um filtro de **sessão viva** exportado, composto por toda leitura e toda invalidação, e uma
  operação "derruba toda sessão viva deste user" compartilhada pelos quatro sites. O repositório de
  usuário para de soletrar colunas de `Session`.
- Um módulo de **cookie de refresh** com três operações — emitir numa resposta, ler de uma
  requisição, limpar —, dono dos atributos e do path. O controller para de conhecer `NODE_ENV`, o
  TTL e o cast do jar.

### Autorização

- Uma primitiva **autorizar-então-carregar** que recebe actor, feature e id, ordena os dois passos
  internamente e deriva o `action` do 403 da feature recebida. O modo *fail-closed* do `pet` (dono
  fora da URL) é um **modo nomeado** da mesma primitiva, não um par de helpers próprio.
- Escopo: `user`, `pet` e `profile` — os três onde a ordem existe e pode ser errada. Os
  `resolveX` do catálogo **ficam como estão**: são find-or-404 puros e a autorização deles é o
  `canAccess` da rota; arrastá-los para a primitiva os obrigaria a receber actor e feature que não
  usam, alargando a interface para ganhar simetria.
- `getUserByEmail` é **removido**: inverte a ordem que `apps/api/docs/adr/0011-autorizacao-sempre-antes-busca.md`
  proíbe e tem zero callers.
- `describeFeatures`, hoje duplicado entre o middleware e um serviço, volta a ter um dono.

### Auditoria e view (as duas que começam por ADR)

- **`writeAudited`**: um helper de nível de repositório que recebe o descriptor e o trabalho a
  rodar na transação, eliminando o braço duplicado; onde a taxonomia exige rastro, o descriptor
  deixa de ser opcional. Restrito por
  `apps/api/docs/adr/0099-record-lib-observabilidade-nao-repository.md` e
  `apps/api/docs/adr/0100-src-lib-nao-conhece-modulo-nenhum.md`: o helper nasce em nível de
  repositório ou agnóstico de módulo. **ADR antes do código.**
- **Escada com pares `(passo, feature que destrava)`** no contrato, e os resolvers da API colapsando
  numa função sobre essa lista. O contrato **declara** a correspondência; a API continua
  **decidindo** — o lado certo da linha que
  `apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md` desenhou ("quem
  sabe o que o viewer pode é a API, não o contrato"). **ADR antes do código**, porque mexe na
  fronteira que o 0199 fixou.
- Os 13 `*.presenter.ts` **não** são tocados: o 0199 decidiu que ficam, e o helper de whitelist que
  eles usam é deep de verdade.

### Acesso ao GitHub (issue 01)

- Instalar o `gh` (pacote do sistema, exige sudo) e autenticar — passos que **só o dono da máquina
  pode executar**. A issue é `ready-for-human`, não `ready-for-agent`.
- A escolha entre `gh auth setup-git` (credential helper do `gh` sobre o remoto HTTPS) e **chave
  SSH** com troca do remoto é do dono do repositório; a issue apresenta as duas com consequência.
- `docs/agents/issue-tracker.md` já foi ajustado para não afirmar que `gh` não existe; o que
  continua valendo é que **GitHub Issues não está em uso** — `gh` aqui é para push, PR e CI, nunca
  para criar issue remota.

### ADRs que o esforço deve

| Decisão | Quando | Onde |
| --- | --- | --- |
| O route entry constrói o handler (a tabela ganha um segundo adapter) | no **fecho** | ADR da API |
| Escada com pares `(passo, feature)` | **antes** do código | ADR da API |
| `writeAudited`: auditoria deixa de ser opt-in | **antes** do código | ADR da API |

Os candidatos de token, sessão viva, cookie, erro e autorizar-antes-de-buscar **não** pedem ADR
novo: completam ou reforçam decisões já registradas (`0069`, `0011`, `0095`) e não têm alternativa
genuína que um leitor futuro questionaria.

## Testing Decisions

**O que é um bom teste aqui.** Este esforço não muda comportamento: o teste que já existe é a
prova, e o teste novo mira a **interface** do módulo aprofundado — nunca sua implementação. Um bom
teste aqui descreve uma invariante do domínio ("token usado é recusado", "ban derruba o que
`GET /auth/sessions` lista", "sem `read:product:cost` o preço de custo não aparece"), não a forma
interna de quem a implementa.

**Regra dura, decidida na grelha: nenhum teste de integração é apagado neste esforço.** A suíte de
~21 mil linhas é o que prova que nove refactors não mudaram nada; apagar o teste que prova a
não-regressão no mesmo commit que a torna possível é a única forma de este esforço sair errado sem
ninguém ver. Só se **acrescenta** teste unitário. O enxugamento da suíte vai para
`docs/reference/backlog.md`, com prova própria (cobertura) e decisão própria.

**Os seams.** Preferimos os que já existem, e o mais alto possível:

| Seam | Novo? | Prior art |
| --- | --- | --- |
| HTTP (Supertest sobre a aplicação) | existente, intocado | `apps/api/tests/integration/v1/` |
| Repositório trocado por fake (`vi.mock`) | existente, hoje só usado por middleware | `apps/api/tests/unit/middlewares/` |
| Função pura de `src/lib/` | existente | `apps/api/tests/unit/lib/` |
| Whitelist de view (`present`/`presentMany`) | existente | teste unitário do presenter de produto |
| Função pura sobre a tabela de rotas, **dentro** do pacote do contrato | **novo** | `packages/api-contracts/tests/purity.test.ts` |
| `registerRoute(entry, handler)` | **novo** — o único seam externo novo | — |

Os outros oito aprofundamentos criam **internal seams**: privados à implementação do módulo,
usados pelos testes dele, sem alargar a interface que a aplicação vê. O único seam externo novo é
o registrador, e ele se justifica com **dois adapters** desde o primeiro dia: o registro de
produção e a travessia que o teste faz da tabela.

**Por módulo:**

- **Tabela de rotas** (issue 02): teste no pacote do contrato, percorrendo a tabela uma vez — todo
  `:param` tem chave em `params`; o envelope só usa `body`/`params`/`query`; as tags casam com as
  declaradas no documento; a escada é contida (`cost` ⊇ `internal` ⊇ `public`); import entre
  domínios aponta para a folha (já violado uma vez); o `exports` do manifesto concorda com o que
  existe em `src/`. Tudo função pura, sem banco.
- **Erro**: teste que parseia o `toJson()` de cada classe (e o 409 do `P2002`) pelo schema de
  envelope do contrato. É o que amarra as duas declarações que hoje não se conhecem.
- **`verificationToken`**: unitário do consume contra `{desconhecido, usado, expirado, purpose
  errado}` — hoje cada um desses só falha por quatro fluxos HTTP distintos. Um caso de integração
  por purpose continua provando o efeito colateral.
- **Cookie de refresh**: unitário contra um `res` falso, com os atributos por ambiente, incluindo
  `secure` em produção.
- **Sessão viva**: teste direto do filtro e da invalidação, em vez de só pelos fluxos de ban, reset
  e troca.
- **Autorizar-então-carregar**: unitário da ordem (403 vence 404) e do modo fail-closed; a matriz
  que hoje é provada por muitos casos HTTP quase idênticos passa a ter um caso de integração por
  recurso, **somado** aos existentes, não em vez deles.
- **Escada**: teste tabelado do mapa feature → passo, que é a parte que vaza dado quando erra.
- **`writeAudited`**: teste da semântica com e sem transação (a falha de auditoria desfaz ou não a
  ação) num lugar só, em vez de reprovada por ação.
- **Rotas migradas**: a prova é a suíte de integração existente permanecer verde a cada commit —
  um commit por rota mantém o bisect útil.
- **Documento OpenAPI** (issue 15): o teste-guarda de que o documento **não pode sub-declarar** um
  status alcançável nasce depois de todas as rotas estarem sob o registrador, e é o que torna a
  correção das 14 rotas verificável em vez de pontual.

## Out of Scope

- **Enxugar a suíte de integração.** Vai para `docs/reference/backlog.md`.
- **Os `resolveX` do catálogo** (marca, categoria, tag, produto, variante, imagem): find-or-404
  puros, sem o hazard de ordem. Ficam.
- **Os 13 `*.presenter.ts`.** `apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md`
  decidiu que ficam; o helper de whitelist é deep e não está em questão.
- **Mover a decisão de view para o contrato.** O contrato declara a correspondência; decidir
  continua na API. Uma versão que movesse a decisão conflitaria com o 0199 e não é esta.
- **Mover `buildPath` para o contrato.** Decisão do `docs/adr/0003-route-table-is-contract-openapi-is-derived.md`.
- **Qualquer mudança de regra de negócio.** Nenhum status novo, nenhuma validação nova, nenhuma
  política de acesso alterada, nenhum campo novo. O 422 das 14 rotas **já acontece**: o que muda é
  o documento passar a dizer a verdade.
- **O web.** Nenhum arquivo de `apps/web` é tocado aqui — é o outro esforço da Fase 12
  (`.scratch/fase-12-web-auth-spine/`), e ele começa depois.
- **Performance.** Nenhuma otimização é objetivo; se um aprofundamento mudar o número de queries,
  isso é regressão a evitar, não ganho a buscar.

## Further Notes

- **O relatório que originou isto era efêmero** (um HTML em `/tmp`). Esta spec é o registro
  durável: as contagens do Problem Statement foram verificadas no tree, uma por uma, e são o que
  uma issue deve poder citar.
- **A ordem dentro da Fase 12 é dependência, não preferência.** As issues de erro, cookie e tabela
  (02, 03, 04) são o que as issues 03, 04 e 07 do esforço do web vão consumir. Feito depois, o web
  escreveria o cliente HTTP, o mapeamento de erro e o cookie contra o estado atual e reescreveria
  os três em seguida — com o custo no lado que ainda não tem teste nenhum.
- **Risco principal:** as duas issues que começam por ADR (escada e `writeAudited`) estão no fim e
  são as mais fáceis de cortar quando o esforço estiver longo. Foi decidido conscientemente
  mantê-las no fim, porque ADR-primeiro no meio das 7 issues de rota quebra o ritmo. Se forem
  cortadas, a decisão é registrar isso — não deixar a metade feita.
- **Risco secundário:** a issue 01 (`gh`) depende de ação humana e pode ficar parada. Por isso ela
  não bloqueia nenhuma outra: o esforço corre inteiro sem ela, com push e PR manuais.
