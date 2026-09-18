import { z } from "zod";

// Enums com dois donos: o Prisma é dono do banco, o contrato é dono do que
// atravessa a rede. Os valores são iguais por prova, não por disciplina — o
// teste de paridade da API compara cada `.options` daqui com o enum gerado pelo
// Prisma de mesmo nome (o nome é a chave em `DOMAIN_ENUMS`). Um valor a mais ou
// a menos de qualquer lado é teste vermelho.

// Perfil definido pela presença da relação (Customer/Employee), não por um
// campo "tipo"; o enum existe para `Role.appliesTo` e para as respostas que
// dizem qual perfil o usuário tem.
export const profileKindSchema = z.enum(["EMPLOYEE", "CUSTOMER"]);
export type ProfileKind = z.infer<typeof profileKindSchema>;

// PENDING até o email ser verificado; ACTIVE depois. Banimento e deleção não
// são status — são `bannedAt`/`deletedAt`, colunas de tempo com significado
// próprio.
export const userStatusSchema = z.enum(["PENDING", "ACTIVE"]);
export type UserStatus = z.infer<typeof userStatusSchema>;
