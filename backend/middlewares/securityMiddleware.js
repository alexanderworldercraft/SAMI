export function createCorsOriginValidator(publicUrl) {
  const allowedOrigins = String(publicUrl || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    return callback(new Error("Origin not allowed by CORS"), false);
  };
}

export async function securityHeadersMiddleware(request, reply) {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (
    process.env.NODE_ENV === "production"
    || process.env.HTTPS
    || String(process.env.PUBLIC_URL || "").startsWith("https://")
  ) {
    reply.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
}
