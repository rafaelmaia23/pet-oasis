import nodemailer from "nodemailer";
import { env } from "@/config/env";
import { createServiceUnavailableError } from "@/errors";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.NODE_ENV === "production",
  ...(env.SMTP_USER
    ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }
    : {}),
});

async function send({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<void> {
  try {
    await transporter.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      html,
      ...(text !== undefined ? { text } : {}),
    });
  } catch (error) {
    throw createServiceUnavailableError({
      message: "Não foi possível enviar o email no momento",
      action: "Tente novamente mais tarde",
      cause: error,
    });
  }
}

export type { SendEmailInput };
export { send };
