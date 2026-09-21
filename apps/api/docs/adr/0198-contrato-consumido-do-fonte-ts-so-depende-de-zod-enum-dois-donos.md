# O contrato é consumido do fonte TS e só depende de `zod`; enum tem dois donos e um teste (11.9)

> Decisão da Fase 11 (issue 09), registrada em 2026-09-19. Nasceu no antigo contexto temático da
> API (**Arquitetura**) enquanto ele era migrado para ADRs (issue 07), e por isso entrou aqui já
> como ADR, no fim da numeração. A regra acionável está no `CLAUDE.md` da raiz; o README do
> pacote (`packages/api-contracts/README.md`) diz o que cada consumidor precisa fazer.
> Contexto de execução em `.scratch/fase-11-monorepo/issues/09-api-contracts-foundation.md`.

`packages/api-contracts` (`@pet-oasis/api-contracts`) é o que atravessa a rede entre a API e os
clientes: nasceu com o que **não depende de nenhum schema da API** — os enums de domínio como
`z.enum`, os nomes de role e feature (e os conjuntos de permissão e privilegiado, o segundo derivado do primeiro) como tuplas `as const`, e o
shape de erro (envelope comum, `code`s conhecidos, `errors` por campo do 422). Esta foi o
"expand" do refactor largo: a API consumiu do contrato só o que já tinha dono duplo —
`role.constants.ts` e `feature.constants.ts` reexportaram os nomes de lá e guardaram só o que o
seed anexa a cada nome (descrição, features por role, `appliesTo`), num `Record<Name, …>` —
chave faltando ou sobrando é erro de typecheck, não teste. O "contract" veio na 11.10: os
schemas de request e as views migraram inteiros, os `*.schema.ts` da API deixaram de existir e
os reexports caíram (a API importa os nomes do contrato). A fronteira caso a caso e o que ficou
na API como composição estão no
[`0199`](0199-schemas-de-request-e-views-sao-codigo-do-contrato.md).

**Duas fronteiras, cada uma com um teste.** (1) O pacote só depende de `zod`: `dependencies` é
exatamente `{ zod }` e nenhum arquivo importa de fora de `src/` — a guarda de pureza no próprio
pacote lê os fontes e reprova qualquer especificador que não seja `zod` ou relativo dentro de
`src/`. É o `.strict()` da regra: o que precisa de Prisma, Express ou helper de servidor não é
contrato e fica na API como composição por cima do schema. (2) Enum tem dois donos com prova: o
Prisma é dono do banco, o contrato do que atravessa a rede, e `tests/unit/contracts/enumParity.test.ts`
percorre o registro `DOMAIN_ENUMS` (chave = nome do enum do Prisma) comparando `.options` com os
valores gerados; todo enum do Prisma tem de estar no registro **ou** numa lista explícita de
internos (hoje só `VerificationPurpose`, que nunca sai do service). Um valor ou um enum a mais ou
a menos de qualquer lado é vermelho. O shape de erro deixa `code` como `z.string()` no envelope
e publica os conhecidos como `ERROR_CODES` à parte, de propósito: um `code` novo na API não pode
quebrar o parse do cliente, e o enum existe para quem trata um caso conhecido ter o nome tipado.

**Fonte TS, não `dist`.** O `exports` aponta para `src/**/*.ts` (o *just-in-time package* do
Turborepo): todo consumidor do workspace já compila TypeScript — tsup/esbuild, `tsx watch`,
Vite/Vitest, Next com `transpilePackages` —, então um `dist/` só acrescentaria um passo de build
entre editar e ver, um artefato obsoleto para o IDE resolver por engano e uma linha a mais no
Dockerfile. O que se paga: o tsup externaliza toda `dependency`, e um `import` de `.ts` deixado
no `dist/server.js` só rodaria pelo type stripping do Node — por isso `noExternal:
["@pet-oasis/api-contracts"]` no `tsup.config.ts`, que inlina o pacote e deixa o `zod` externo
(é dependência da própria API; o bundle sai com comentários de caminho do contrato e nenhum
import dele). E cada consumidor typechecka o fonte do contrato com o próprio `tsconfig`; a
garantia de que ele compila sob o preset mais estrito vem do `typecheck` do pacote, que roda o
`src/` sob `tsconfig.library.json` (sem DOM nem Node) e os testes sob um `tsconfig.test.json` de
Node — a guarda de pureza lê o filesystem. No `turbo.jsonc`, o `^build` de `typecheck` e `build`
vira nó vazio; fica, porque é a ordem pronta para o dia em que um consumidor não compilar TS.
No Docker nada mudou: o `COPY packages packages` da 11.3 já entrega o fonte, o `pnpm deploy
--prod` materializa o pacote (é `dependency`) e os três estágios buildam.
