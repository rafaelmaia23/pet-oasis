import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Maria Silva" }),
  })
  .meta({
    id: "UserDefault",
    description: "Visão pública mínima de um usuário (id + nome)",
  });

const ownerView = defaultView
  .extend({
    email: z.email(),
    pendingEmail: z.email().nullable(),
    cpf: z.string().meta({ example: "12345678901" }),
    customer: z
      .object({
        phone: z.string().meta({ example: "11987654321" }),
        address: z.string().nullable(),
        birthDate: z.coerce.date().nullable(),
      })
      .nullable(),
    employee: z
      .object({
        hiringDate: z.coerce.date(),
      })
      .nullable(),
  })
  .meta({
    id: "UserOwner",
    description: "Visão do próprio dono (dados pessoais + perfis)",
  });

const adminView = ownerView
  .extend({
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    roles: z.array(
      z.object({
        role: z.object({
          id: z.uuid(),
          name: z.string(),
        }),
      }),
    ),
    features: z.array(
      z.object({
        granted: z.boolean(),
        grantedAt: z.coerce.date(),
        feature: z.object({
          id: z.uuid(),
          name: z.string(),
        }),
      }),
    ),
  })
  .meta({
    id: "UserAdmin",
    description:
      "Visão administrativa (quem tem read:user:others) — inclui roles e overrides de feature",
  });

export const userViews = {
  default: defaultView,
  owner: ownerView,
  admin: adminView,
} as const;

export type UserView = keyof typeof userViews;

export const userPresenter = createPresenter(userViews);
