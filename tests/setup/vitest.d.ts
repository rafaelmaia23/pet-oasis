import "vitest";
import type { z } from "zod";

declare module "vitest" {
  interface Assertion<T = unknown> {
    toMatchView(view: z.ZodType): T;
  }
  interface AsymmetricMatchersContaining {
    toMatchView(view: z.ZodType): unknown;
  }
}
