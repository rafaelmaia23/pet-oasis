import z from "zod";

export const roleParamsSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid role ID"),
  }),
});
