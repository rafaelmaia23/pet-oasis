import { z } from "zod";
import { ProfileKind } from "@/generated/prisma/enums";
import { createPresenter } from "@/utils/presenter";

const roleSummaryView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "customer" }),
    description: z.string(),
    appliesTo: z.enum(ProfileKind),
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
        phone: z.string().meta({ example: "11987654321" }),
        address: z.string().nullable(),
        birthDate: z.coerce.date().nullable(),
        roles: z.array(roleSummaryView),
      })
      .nullable(),
    employee: z
      .object({
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

export const mePresenter = createPresenter(meViews);
