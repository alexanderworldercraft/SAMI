// middlewares/authMiddleware.js

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();
const secretKey = process.env.JWT_SECRET;

export const authMiddleware = async (request, reply) => {
  try {
    const authHeader = request.headers["authorization"];
    if (!authHeader) {
      return reply.status(401).send({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return reply.status(401).send({ error: "Invalid token" });
    }

    // Vérification du token (mode sync pour éviter double-callback)
    const decoded = jwt.verify(token, secretKey);
    request.user = decoded;
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      console.error("Token expired at:", err.expiredAt);
      return reply.status(401).send({ error: "Token expired", expiredAt: err.expiredAt });
    }
    console.error("Invalid token:", err?.message || err);
    return reply.status(401).send({ error: "Invalid token" });
  }
};
