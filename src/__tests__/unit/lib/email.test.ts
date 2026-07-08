import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableError } from "@/errors";

const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));

vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
}));

const { send } = await import("@/lib/email");

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
