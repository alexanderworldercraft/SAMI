import { describe, expect, it, vi } from "vitest";
import {
  createSmtpTransport,
  getSmtpConfig,
  sendPasswordResetEmail,
} from "../services/mailService.js";

const smtpEnv = (overrides = {}) => ({
  SMTP_HOST: "smtp.mail.ovh.net",
  SMTP_PORT: "465",
  SMTP_USER: "no-reply@example.com",
  SMTP_PASS: "secret-test",
  SMTP_FROM: '"SAMI" <no-reply@example.com>',
  ...overrides,
});

describe("service SMTP", () => {
  it("active SSL/TLS implicit sur le port 465", () => {
    expect(getSmtpConfig(smtpEnv())).toMatchObject({
      host: "smtp.mail.ovh.net",
      port: 465,
      secure: true,
      requireTLS: false,
      user: "no-reply@example.com",
      from: '"SAMI" <no-reply@example.com>',
    });
  });

  it("conserve STARTTLS sur le port 587", () => {
    expect(getSmtpConfig(smtpEnv({ SMTP_PORT: "587" }))).toMatchObject({
      port: 587,
      secure: false,
      requireTLS: true,
    });
  });

  it("refuse une configuration incomplète ou un port invalide", () => {
    expect(() => getSmtpConfig(smtpEnv({ SMTP_PASS: "" })))
      .toThrow(/SMTP_PASS/);
    expect(() => getSmtpConfig(smtpEnv({ SMTP_PORT: "not-a-port" })))
      .toThrow(/SMTP_PORT/);
  });

  it("transmet à Nodemailer une configuration TLS sans exposer l'expéditeur", () => {
    const createTransport = vi.fn(() => ({ sendMail: vi.fn() }));

    const result = createSmtpTransport(smtpEnv(), createTransport);

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.mail.ovh.net",
      port: 465,
      secure: true,
      requireTLS: false,
      auth: {
        user: "no-reply@example.com",
        pass: "secret-test",
      },
      tls: {
        minVersion: "TLSv1.2",
      },
    });
    expect(result.from).toBe('"SAMI" <no-reply@example.com>');
  });

  it("envoie l'e-mail de réinitialisation puis ferme le transport", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "test-message" });
    const close = vi.fn();
    const createTransport = vi.fn(() => ({ sendMail, close }));

    await sendPasswordResetEmail(
      "patrick@example.com",
      "Patrick",
      "Temporaire-123!",
      smtpEnv(),
      createTransport
    );

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"SAMI" <no-reply@example.com>',
      to: "patrick@example.com",
      subject: "Réinitialisation de votre mot de passe SAMI",
      text: expect.stringContaining("Temporaire-123!"),
    }));
    expect(close).toHaveBeenCalledOnce();
  });
});
