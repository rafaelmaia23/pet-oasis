# Os tipos vêm do OpenAPI da API; Zod valida formulário, não resposta

A API gera `/openapi.json` a partir dos próprios schemas Zod. `openapi-typescript`
transforma isso num `.d.ts` **commitado no repo** — para que o build do front nunca dependa
da API estar de pé — regenerável por `npm run api:types`. O cliente HTTP é um `apiFetch`
tipado escrito à mão.

## Considered Options

- **Geradores de cliente completo (orval, kubb).** Geram tipos, cliente e hooks de React
  Query. Recusados: os hooks são de uma biblioteca que a ADR-0002 dispensou, e o cliente
  gerado esconde exatamente a camada onde mora a lógica do BFF.
- **Reescrever os schemas Zod no front.** Recusado: duplica a fonte da verdade, e a cópia
  diverge silenciosamente na primeira mudança da API.

## Consequences

Zod existe no front **apenas** para validar formulário antes do envio. Resposta da API não
é revalidada em runtime: ela é a autoridade do contrato, e desconfiar dela custa CPU e
código para detectar um defeito que seria dela, não nosso. A validação de formulário é
conveniência de UX — a validação que decide é sempre a da API, que responde 422 no mesmo
shape.
