import { DOMAIN_ENUMS } from "@pet-oasis/api-contracts";
import { describe, expect, it } from "vitest";
import * as PrismaEnums from "@/generated/prisma/enums";

// Enum com dois donos, com prova: o Prisma é dono do banco, o contrato é dono
// do que atravessa a rede, e este teste é o que impede os dois de divergirem em
// silêncio. Para cada entrada de `DOMAIN_ENUMS` (chave = nome do enum do
// Prisma), os `options` do `z.enum` são exatamente os valores do enum gerado.
// Um valor a mais ou a menos de qualquer lado é teste vermelho — e um enum
// novo de qualquer lado também, porque a lista dos dois lados é comparada.

// Enums do Prisma que NÃO atravessam a rede: existem só entre o service e o
// banco, nenhum schema ou view os expõe. Entrar aqui é decisão explícita — um
// enum novo no `schema.prisma` fica vermelho até ser registrado no contrato ou
// declarado interno nesta lista.
const INTERNAL_ENUMS = [
  // Propósito do token de verificação (email, senha, troca de email,
  // reativação): o cliente recebe o token opaco, nunca o propósito.
  "VerificationPurpose",
] as const;

const prismaEnumNames = Object.keys(PrismaEnums).sort();

describe("paridade dos enums: contrato × Prisma", () => {
  it("cobre todo enum do Prisma — no contrato ou declarado interno", () => {
    const covered = [...Object.keys(DOMAIN_ENUMS), ...INTERNAL_ENUMS].sort();

    expect(covered).toEqual(prismaEnumNames);
  });

  it("não declara interno um enum que o contrato também expõe", () => {
    const both = INTERNAL_ENUMS.filter((name) => name in DOMAIN_ENUMS);

    expect(both).toEqual([]);
  });

  for (const [name, schema] of Object.entries(DOMAIN_ENUMS)) {
    it(`${name}: os valores do contrato são exatamente os do Prisma`, () => {
      const prismaEnum = (PrismaEnums as Record<string, unknown>)[name];
      expect(prismaEnum, `enum ${name} não existe no Prisma`).toBeDefined();

      const prismaValues = Object.values(
        prismaEnum as Record<string, string>,
      ).sort();
      const contractValues = [...schema.options].sort();

      expect(contractValues).toEqual(prismaValues);
    });
  }
});
