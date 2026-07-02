import { z } from "zod";

export const featureParamsSchema = z.object({
  params: z.object({
    id: z.uuid("Invalid feature ID"),
  }),
});
