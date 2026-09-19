import { z } from "zod";
import { profileKindSchema } from "../user/user.enums";

const roleSummaryView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "customer" }),
    description: z.string(),
    appliesTo: profileKindSchema,
  })
  .meta({ id: "RoleSummary" });

const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Maria Silva" }),
    email: z.email(),
    pendingEmail: z.email().nullable(),
    cpf: z.string().meta({ example: "12345678901" }),
    customer: z
      .object({
        // O id do **perfil**, e não o do usuário: é ele que endereça a coleção
        // aninhada `/customers/:customerId/pets` (9.4). Sem este campo o
        // cliente não teria como chegar aos próprios pets — não existe
        // `/me/pets` nesta fase, por decisão registrada no backlog.
        id: z.uuid(),
        phone: z.string().meta({ example: "11987654321" }),
        address: z.string().nullable(),
        birthDate: z.coerce.date().nullable(),
        roles: z.array(roleSummaryView),
      })
      .nullable(),
    employee: z
      .object({
        id: z.uuid(),
        hiringDate: z.coerce.date(),
        roles: z.array(roleSummaryView),
      })
      .nullable(),
    features: z
      .array(z.string())
      .meta({ example: ["read:user", "update:user"] }),
  })
  .meta({
    id: "Me",
    description:
      "Perfil do próprio usuário autenticado com as features efetivas computadas",
  });

export const meViews = { default: defaultView } as const;

export type MeView = keyof typeof meViews;
