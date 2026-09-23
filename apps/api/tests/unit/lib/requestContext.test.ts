import { describe, expect, it } from "vitest";
import {
  getRequestContext,
  runWithRequestContext,
  setActorId,
} from "@/lib/requestContext";

describe("requestContext", () => {
  it("should expose the context inside the store", () => {
    runWithRequestContext({ requestId: "req-1" }, () => {
      expect(getRequestContext()?.requestId).toBe("req-1");
    });
  });

  // Scripts, seed e o boot rodam fora de qualquer request.
  it("should return undefined outside of a store", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("should let setActorId fill the current store", () => {
    runWithRequestContext({ requestId: "req-2" }, () => {
      setActorId("user-42");

      expect(getRequestContext()?.actorId).toBe("user-42");
    });
  });

  it("should not throw when setActorId runs outside a store", () => {
    expect(() => setActorId("user-42")).not.toThrow();
  });

  // É o ponto do AsyncLocalStorage: dois requests concorrentes não se misturam.
  it("should keep concurrent contexts isolated across awaits", async () => {
    const seen: string[] = [];

    const run = (id: string, delayMs: number) =>
      runWithRequestContext({ requestId: id }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        seen.push(getRequestContext()?.requestId ?? "perdido");
      });

    await Promise.all([run("lento", 20), run("rapido", 1)]);

    expect(seen).toEqual(["rapido", "lento"]);
  });
});
