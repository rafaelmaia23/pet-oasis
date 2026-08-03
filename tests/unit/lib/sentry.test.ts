import * as Sentry from "@sentry/node";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "@/lib/sentry";

// SENTRY_DSN não está setado em .env.test (D6) — importar o módulo não deve
// ter chamado Sentry.init().
describe("Sentry activation (D6)", () => {
  it("stays uninitialized when SENTRY_DSN is absent", () => {
    expect(Sentry.isInitialized()).toBe(false);
  });
});

// scrubEvent é função pura — testável sem importar/mockar @sentry/node.
describe("scrubEvent()", () => {
  it("censors forbidden fields anywhere in the tree", () => {
    const event = {
      request: {
        headers: {
          authorization: "Bearer jwt.abc.def",
          cookie: "refreshToken=opaco-456",
          "user-agent": "curl/8.0",
        },
        data: { password: "SenhaSecreta1!", email: "user@example.com" },
      },
      extra: { token: "opaco-123", accessToken: "jwt.abc.def" },
      contexts: {
        nested: { currentPassword: "x", newPassword: "y", passwordHash: "z" },
      },
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request.headers.authorization).toBe("[REDACTED]");
    expect(scrubbed.request.headers.cookie).toBe("[REDACTED]");
    expect(scrubbed.request.data.password).toBe("[REDACTED]");
    expect(scrubbed.extra.token).toBe("[REDACTED]");
    expect(scrubbed.extra.accessToken).toBe("[REDACTED]");
    expect(scrubbed.contexts.nested.currentPassword).toBe("[REDACTED]");
    expect(scrubbed.contexts.nested.newPassword).toBe("[REDACTED]");
    expect(scrubbed.contexts.nested.passwordHash).toBe("[REDACTED]");
  });

  it("leaves unrelated fields untouched", () => {
    const event = {
      request: {
        headers: { "user-agent": "curl/8.0" },
        data: { email: "user@example.com" },
      },
      extra: { userId: "abc-123" },
    };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request.headers["user-agent"]).toBe("curl/8.0");
    expect(scrubbed.request.data.email).toBe("user@example.com");
    expect(scrubbed.extra.userId).toBe("abc-123");
  });

  it("handles arrays without dropping entries", () => {
    const event = { breadcrumbs: [{ token: "secret" }, { message: "ok" }] };

    const scrubbed = scrubEvent(event);

    expect(scrubbed.breadcrumbs).toHaveLength(2);
    expect(scrubbed.breadcrumbs[0]?.token).toBe("[REDACTED]");
    expect(scrubbed.breadcrumbs[1]?.message).toBe("ok");
  });
});
