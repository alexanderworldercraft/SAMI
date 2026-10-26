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

export async function sendPasswordRecoveryEmail(
  to,
  surnom,
  confirmationUrl,
  env = process.env,
  createTransport = nodemailer.createTransport
) {
  const { transporter, from } = createSmtpTransport(env, createTransport);
  const subject = "Réinitialisation de votre mot de passe SAMI";
  const text = `Bonjour ${surnom},

Une récupération de ton compte SAMI a été demandée.
Confirme cette demande avec ce lien, valable quinze minutes :
${confirmationUrl}

Ton mot de passe actuel reste inchangé jusqu’à la confirmation du lien.
Les sessions existantes sont déconnectées dès que cette demande est envoyée.
Après confirmation, un mot de passe temporaire sera affiché une seule fois.
Sa première utilisation imposera de choisir un nouveau mot de passe personnel.

Si tu n’es pas à l’origine de cette demande, ignore ce message et contacte l’administrateur.

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
