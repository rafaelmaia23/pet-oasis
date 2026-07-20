import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { expect } from "vitest";

export function expectValidDate(value: unknown) {
  expect(typeof value).toBe("string");
  expect(new Date(value as string).getTime()).not.toBeNaN();
}

export function expectValidUuid(value: unknown) {
  expect(typeof value).toBe("string");
  expect(uuidValidate(value as string)).toBe(true);
  expect(uuidVersion(value as string)).toBe(4);
}

export function expectValidationError(
  response: { status: number; body: unknown },
  expectedFields?: string[],
) {
  const body = response.body as {
    code: string;
    errors: Record<string, string[]>;
  };

  expect(body.code).toBe("VALIDATION_ERROR");

  expect(body.errors).toBeTypeOf("object");
  expect(Array.isArray(body.errors)).toBe(false);
  expect(Object.keys(body.errors).length).toBeGreaterThan(0);

  for (const messages of Object.values(body.errors)) {
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
  }

  if (expectedFields) {
    for (const field of expectedFields) {
      expect(body.errors).toHaveProperty(field);
    }
  }
}
