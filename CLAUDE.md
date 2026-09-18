# pet-oasis — monorepo

Este arquivo é provisório: enquanto a Fase 11 não escreve o guia geral da raiz, o guia da API
vale para o repositório inteiro e é importado daqui. O tracker da fase está em
`apps/api/.scratch/monorepo/`.

## ⚠️ REGRA — O contrato só depende de `zod`; enum tem dois donos e um teste

`packages/api-contracts` (`@pet-oasis/api-contracts`) é o que atravessa a rede entre a API e
os clientes. **A única dependência de runtime é `zod`**, e nenhum arquivo dele importa de fora
de `src/` — sem `@/`, sem `@prisma`, sem `apps/`. Se um schema precisa de outra coisa (Prisma,
Express, helper de servidor), a coisa não é contrato: fica na API, como composição por cima do
schema do contrato. A guarda é `packages/api-contracts/tests/purity.test.ts`.

**Enum de domínio tem dois donos, com prova:** o Prisma é dono do banco, o contrato é dono do
que atravessa a rede (`z.enum`, registrado em `DOMAIN_ENUMS` pelo nome do enum do Prisma). Os
dois são editados juntos, e `apps/api/tests/unit/contracts/enumParity.test.ts` é o que garante
o "juntos" — um valor ou um enum a mais ou a menos de qualquer lado é teste vermelho. Enum do
Prisma que não atravessa a rede é declarado interno nesse teste, explicitamente.

O contrato é consumido **do fonte TS**, sem build (`exports` → `src/**/*.ts`); o porquê e o que
isso exige de cada consumidor (`noExternal` no tsup da API, `transpilePackages` no Next) estão
no README do pacote.

@apps/api/CLAUDE.md
