import { z } from "zod";

// Enum com dois donos (ver `src/user/user.enums.ts`): o teste de paridade da API
// prova que os valores batem com o enum gerado pelo Prisma.

// "Isto está à venda?" e "isto existe?" são perguntas diferentes: o status
// convive com o soft delete. DISCONTINUED some da vitrine mas preserva o
// histórico de venda; excluído é erro de cadastro. DRAFT ainda não está à
// venda e só aparece para quem tem `read:product:internal`.
export const productStatusSchema = z.enum(["DRAFT", "ACTIVE", "DISCONTINUED"]);
export type ProductStatus = z.infer<typeof productStatusSchema>;
