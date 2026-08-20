import nodemailer from "nodemailer";

const REQUIRED_SMTP_VARIABLES = Object.freeze([
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
]);

const readValue = (env, key) => String(env[key] || "").trim();

export function getSmtpConfig(env = process.env) {
  const missingVariables = REQUIRED_SMTP_VARIABLES.filter(
    (key) => !readValue(env, key)
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Configuration SMTP incomplète : ${missingVariables.join(", ")}.`
    );
  }

  const port = Number(readValue(env, "SMTP_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT doit être un entier compris entre 1 et 65535.");
  }

  return Object.freeze({
    host: readValue(env, "SMTP_HOST"),
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    user: readValue(env, "SMTP_USER"),
    pass: readValue(env, "SMTP_PASS"),
    from: readValue(env, "SMTP_FROM"),
  });
}

export function createSmtpTransport(
  env = process.env,
  createTransport = nodemailer.createTransport
) {
  const config = getSmtpConfig(env);
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      minVersion: "TLSv1.2",
    },
  });

  return { transporter, from: config.from };
}

export async function verifySmtpConnection(env = process.env) {
  const { transporter } = createSmtpTransport(env);

  try {
    await transporter.verify();
  } finally {
    transporter.close?.();
  }
}

export async function sendPasswordResetEmail(
  to,
  surnom,
  tempPassword,
  env = process.env,
  createTransport = nodemailer.createTransport
) {
  const { transporter, from } = createSmtpTransport(env, createTransport);
  const subject = "Réinitialisation de votre mot de passe SAMI";
  const text = `Bonjour ${surnom},

Un nouveau mot de passe temporaire a été généré pour votre compte SAMI.

Nouveau mot de passe temporaire : ${tempPassword}

Connectez-vous avec ce mot de passe puis changez-le dans vos paramètres dès que possible.

Si vous n'êtes pas à l'origine de cette demande, il est conseillé de prévenir l'administrateur.

— SAMI`;

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });
  } finally {
    transporter.close?.();
  }
}
