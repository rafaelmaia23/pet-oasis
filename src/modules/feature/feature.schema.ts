import { z } from "zod";

export const featureParamsSchema = z.object({
  params: z.object({
    id: z.guid("Invalid feature ID"),
  }),
});
