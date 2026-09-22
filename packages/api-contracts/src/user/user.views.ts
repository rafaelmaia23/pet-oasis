import { z } from "zod";

// Views de resposta do usuário, resolvidas na API pela feature efetiva do viewer.
// Cada view é uma whitelist: o presenter da API faz `.parse()` e derruba o que
// não está listado, então nada sensível vaza por omissão.

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
        // Id do perfil — endereça `/customers/:customerId/pets` (9.4). Mesmo
        // campo que `GET /me` expõe; aqui serve ao staff que abre a ficha do
        // cliente para cadastrar um pet em nome dele.
        id: z.uuid(),
        phone: z.string().meta({ example: "11987654321" }),
        address: z.string().nullable(),
        birthDate: z.coerce.date().nullable(),
      })
      .nullable(),
    employee: z
      .object({
        id: z.uuid(),
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
        // Os overrides moram dentro da atribuição de role (D2) — a view
        // espelha a junção em vez de achatá-la, para não perder a informação
        // de a qual atribuição cada ajuste pertence.
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
      }),
    ),
  })
  .meta({
    id: "UserAdmin",
    description:
      "Visão administrativa (quem tem read:user:others) — inclui roles e overrides de feature",
  });

/**
 * A escada de quem lê um usuário, em ordem: `owner` é o que o dono vê de si;
 * quem tem `read:user:others` recebe `admin`, que acrescenta roles e
 * overrides. A view é escolhida pelo **ator**, não pela rota, então toda
 * resposta que devolve um usuário declara as duas.
 *
 * `default` fica de fora: é a visão mínima que aparece *dentro* de outra view
 * (id + nome), nunca como resposta de uma rota.
 */
export const userViewLadder = [ownerView, adminView] as const;

export const userViews = {
  default: defaultView,
  owner: ownerView,
  admin: adminView,
} as const;

export type UserView = keyof typeof userViews;
