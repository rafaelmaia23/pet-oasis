import { z } from "zod";

export const permissionParamsSchema = z.object({
  params: z.object({
    userId: z.guid("Invalid user ID"),
    featureId: z.guid("Invalid feature ID"),
  }),
});

export const userIdParamsSchema = z.object({
  params: z.object({
    userId: z.guid("Invalid user ID"),
  }),
});

export type PermissionParams = z.infer<typeof permissionParamsSchema>["params"];
