# Os schemas vêm do contrato compartilhado; Zod valida formulário, não resposta

> Revisto em 2026-09-19. A primeira versão desta decisão (`openapi-typescript` gerando um
> `.d.ts` commitado a partir do `/openapi.json` da API, regenerável por `npm run api:types`)
> foi tomada quando web e API eram repositórios separados. O monorepo `pet-oasis` criou o
> pacote `@pet-oasis/api-contracts`, e ele dissolve o motivo da versão anterior. O número é
> mantido porque o `CLAUDE.md` e a spec o citam pela consequência que sobreviveu: Zod valida
> formulário, nunca resposta.

Os tipos com que o front fala com a API vêm de **`@pet-oasis/api-contracts`**: schemas de
request, views de resposta, enums de domínio, nomes de role e feature, `ERROR_CODES` e a
**tabela de rotas** (path e verbo ligados ao schema de request e às views de resposta). O
pacote só depende de `zod`, a API o consome nos próprios controllers e presenters, e o web o
importa por `workspace:*`, do fonte TS, com `transpilePackages`. O cliente HTTP é um
`apiFetch` escrito à mão, tipado pela tabela de rotas: nenhum path é escrito no web, e uma
mudança de contrato quebra o `typecheck` do web **no mesmo PR**.

## Considered Options

- **`openapi-typescript` a partir do `/openapi.json`** (a versão anterior). Recusada agora: o
  `.d.ts` commitado só muda quando alguém roda o script, então uma mudança de contrato no
  mesmo PR não quebra o web por esse caminho — perde justamente a garantia que o monorepo
  existe para dar. E seria uma segunda derivação da mesma fonte (o OpenAPI já é gerado do
  contrato), que envelhece separada.
- **Contrato para Zod e constantes, OpenAPI para o mapa de rotas.** Recusada pelo mesmo
  motivo, com um agravante: a tabela de rotas *é* contrato — se o pacote não a tem, o pacote
  cresce (issue `00` da espinha de autenticação), em vez de o web escrever uma terceira cópia
  do path.
- **Geradores de cliente completo (orval, kubb).** Geram tipos, cliente e hooks de React
  Query. Recusados: os hooks são de uma biblioteca que a ADR-0002 dispensou, e o cliente
  gerado esconde exatamente a camada onde mora a lógica do BFF.
- **Reescrever os schemas Zod no front.** Recusado: duplica a fonte da verdade, e a cópia
  diverge silenciosamente na primeira mudança da API. O pacote compartilhado é o que torna a
  duplicação desnecessária.

## Consequences

Zod existe no front **apenas** para validar formulário antes do envio — com o **schema de
request do contrato**, então o formulário valida exatamente o que a API valida. As views de
resposta entram só como tipo (`z.infer`): resposta da API **não passa por `.parse()`**. Ela é
a autoridade do contrato, e desconfiar dela custa CPU e código para detectar um defeito que
seria dela, não nosso. A validação de formulário é conveniência de UX — a validação que decide
é sempre a da API, que responde 422 no mesmo shape (`validationErrorResponseSchema`).
