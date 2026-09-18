import z from "zod";
import { ProfileKind } from "@/generated/prisma/enums";
import { createPresenter } from "@/utils/presenter";

const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "manager" }),
    description: z.string().meta({ example: "Gerente da loja" }),
    appliesTo: z.enum(ProfileKind),
    features: z.array(
      z.object({
        id: z.uuid(),
        name: z.string().meta({ example: "read:user:others" }),
        description: z.string(),
      }),
    ),
  })
  .meta({
    id: "Role",
    description: "Papel do sistema com as features que ele agrega",
  });

export const roleViews = { default: defaultView } as const;

export type RoleView = keyof typeof roleViews;

export const rolePresenter = createPresenter(roleViews);
