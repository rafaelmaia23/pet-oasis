import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { ServiceUnavailableError } from "@/errors";

const { sendMailMock, createTransportMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn(),
  createTransportMock: vi.fn((_options: Record<string, unknown>) => ({
    sendMail: vi.fn(),
  })),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

createTransportMock.mockReturnValue({ sendMail: sendMailMock });

const { send } = await import("@/lib/email");

// 7.12 — sem timeout, um relay morto pendura o `await send()` de um request
// (signup, forgot-password) pelo default generoso do nodemailer.
describe("SMTP transporter timeouts (7.12)", () => {
  it("configures connection/greeting/socket timeouts from env", () => {
    const options = createTransportMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(options.connectionTimeout).toBe(env.SMTP_CONNECTION_TIMEOUT_MS);
    expect(options.greetingTimeout).toBe(env.SMTP_GREETING_TIMEOUT_MS);
    expect(options.socketTimeout).toBe(env.SMTP_SOCKET_TIMEOUT_MS);
  });
});

describe("Email", () => {
  beforeEach(() => {
    sendMailMock.mockReset();
  });

  it("should send through the transporter with from/to/subject/html", async () => {
    sendMailMock.mockResolvedValue({ messageId: "abc" });

    await send({
      to: "user@example.com",
      subject: "Bem-vindo",
      html: "<p>Olá</p>",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.any(String),
        to: "user@example.com",
        subject: "Bem-vindo",
        html: "<p>Olá</p>",
      }),
    );
  });

  it("should include text in the payload when provided", async () => {
    sendMailMock.mockResolvedValue({ messageId: "abc" });

    await send({
      to: "user@example.com",
      subject: "Assunto",
      html: "<p>oi</p>",
      text: "oi",
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ text: "oi" }),
    );
  });

  it("should omit the text key when not provided", async () => {
    sendMailMock.mockResolvedValue({ messageId: "abc" });

    await send({
      to: "user@example.com",
      subject: "Assunto",
      html: "<p>oi</p>",
    });

    const payload = sendMailMock.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty("text");
  });

  it("should throw ServiceUnavailableError when the transport fails", async () => {
    sendMailMock.mockRejectedValue(new Error("smtp down"));

    await expect(
      send({
        to: "user@example.com",
        subject: "Assunto",
        html: "<p>oi</p>",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
