# A tabela de rotas é contrato, e o `/openapi.json` é derivado dela

> Decisão de sistema, tomada na Fase 11 e executada na issue 17
> (`.scratch/fase-11-monorepo/issues/17-route-table-in-the-contract.md`). Vale para a fronteira
> entre a API e qualquer cliente dela. O *o que é contrato* já estava decidido em
> [`apps/api/docs/adr/0199`](../../apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md)
> para schemas e views; esta estende a mesma regra ao endereço das rotas.

Depois da Fase 11 os schemas de request e as views de resposta já viviam em
`packages/api-contracts`, mas o **endereço** de cada operação não: ele existia duas vezes, no
router do Express e em `apps/api/src/docs/paths/*.ts`, e uma terceira vez em cada cliente, que
montava `"/auth/login"` à mão. As três cópias não tinham nada que as mantivesse iguais — trocar
um path no router deixava o `/openapi.json` mentindo, e o web só descobria em runtime.

**Decidimos** que a tabela de rotas é parte do contrato: `packages/api-contracts/src/routes/`,
um módulo por domínio agregado num índice, entrada aninhada por domínio e nomeada pela operação
(`routes.auth.login`, `routes.product.list`). Cada entrada carrega o método, o path **na forma
do Express** (`/users/:id`), o schema de request do próprio contrato, a resposta por status, o
shape de erro por status, se a rota é pública ou exige bearer, e a prosa que antes só o OpenAPI
carregava. O pacote continua dependendo só de `zod`.

O `/openapi.json` passa a ser **derivado**: `apps/api/src/docs/adapter.ts` converte `:id` →
`{id}`, envelope → `parameters`/`requestBody`, escada de views → união e
`<domínio>.<operação>` → `operationId`. Na API sobra só o que é do servidor — o corpo
multipart dos uploads e o teto de tamanho, os security schemes, os `servers`, a prosa do
documento e o bundle do Scalar. Quem prova que o documento não mudou de forma é o
`openapi.test.ts`, que passa sem edição.

**Atualização (Fase 12, issue 15).** A paridade tabela × router deixou de precisar de teste: com
as 79 rotas de domínio migradas para o `registerRoute` (`apps/api/src/lib/registerRoute.ts`), o
router do Express é *construído* a partir da entrada da tabela, não mais escrito à mão ao lado
dela — a concordância virou estrutural. O antigo
`apps/api/tests/unit/contracts/routeParity.test.ts` (que comparava os dois lados via
monkey-patch do `Router.prototype.use` do Express) saiu; o único invariante dele que não tinha
outra prova — o par `método + path` não se repetir dentro da própria tabela — migrou para
`packages/api-contracts/tests/route-table.test.ts`. As duas rotas de documentação que ficam fora
da tabela (`/openapi.json`, o bundle do Scalar) não têm mais comparação automática contra "tudo
fora de `/api/v1`"; cada uma prova a própria existência em seu teste de integração
(`openapi.test.ts`, `reference.test.ts`).

**O path fica na forma do Express, e não no template do OpenAPI**, porque é o router que é
comparado com a tabela: normalizar de um lado só esconderia justamente o erro de digitação que
a comparação existe para pegar. **Montar a URL é do cliente**, não do contrato — um `buildPath`
precisa decidir encoding, query string e base URL, e nada disso atravessa a rede. E a escada de
capability vira `anyOf`, não `oneOf`: os degraus se contêm, e `oneOf` acusaria como inválido o
corpo que a API realmente devolve.

**A escada vale para o recurso, não para a listagem.** Onde a resposta é um recurso, `view` é a
escada e o documento publica a união — são dez rotas (produto: detalhe, criação e atualização;
variante: criação e atualização; usuário: criação, leitura e atualização; perfil: criação de
customer e de employee), e antes desta issue as dez publicavam **uma** view, embora a API já
resolvesse a forma pela feature efetiva do ator. Numa listagem, não: o degrau é escolhido uma
vez para a página inteira, e uma união de três envelopes tiraria o `meta` da paginação do
alcance de quem lê a spec ou gera cliente. A listagem da vitrine declara o degrau público e
descreve a escada na prosa da rota — o envelope mora em `productListSchema`, ao lado das views.
