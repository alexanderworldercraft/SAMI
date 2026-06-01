// Importation de PrismaClient depuis le module @prisma/client pour interagir avec la base de données
import { PrismaClient } from "@prisma/client";

// Initialisation d'une instance de PrismaClient pour gérer les opérations sur la base de données
let client = new PrismaClient();

// Log de confirmation de connexion à la base de données pour le débogage
console.log("[DEBUG] Connected to DB");

// Exportation de l'instance Prisma pour l'utiliser dans d'autres modules de l'application
export const prisma = client; // Export nommé
export default client;        // Export par défaut