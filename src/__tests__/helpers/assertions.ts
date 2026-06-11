import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { expect } from "vitest";
import type z from "zod";

export function expectValidDate(value: unknown) {
  expect(typeof value).toBe("string");
  expect(new Date(value as string).getTime()).not.toBeNaN();
}

export function expectValidUuid(value: unknown) {
  expect(typeof value).toBe("string");
  expect(uuidValidate(value as string)).toBe(true);
  expect(uuidVersion(value as string)).toBe(4);
}

export function expectMatchesView(body: unknown, view: z.ZodType) {
  const result = view.safeParse(body);
  if (!result.success) {
    throw new Error(
      `Response não bate com a view: ${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }
}
