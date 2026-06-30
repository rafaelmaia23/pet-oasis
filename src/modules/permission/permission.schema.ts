import { z } from "zod";

export const upsertPermissionParamsSchema = z.object({
  params: z.object({
    userId: z.uuid("Invalid user ID"),
    featureId: z.uuid("Invalid feature ID"),
  }),
  body: z.object({
    granted: z.boolean({ message: "Invalid granted value" }),
  }),
});

export const getPermissionParamsSchema = z.object({
  params: z.object({
    userId: z.uuid("Invalid user ID"),
  }),
});

export const removePermissionParamsSchema = z.object({
  params: z.object({
    userId: z.uuid("Invalid user ID"),
    featureId: z.uuid("Invalid feature ID"),
  }),
});

export type GetPermissionParams = z.infer<
  typeof getPermissionParamsSchema
>["params"];

export type UpsertPermissionParams = z.infer<
  typeof upsertPermissionParamsSchema
>["params"];

export type RemovePermissionParams = z.infer<
  typeof removePermissionParamsSchema
>["params"];
