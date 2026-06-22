import Fastify from "fastify";
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import fastifyStatic from '@fastify/static';
import userRoutes from './routes/userRoutes.js';
import videoRoutes from "./routes/videoRoutes.js"; 
import genreRoutes from "./routes/genreRoutes.js"; 
import seriesRoutes from "./routes/seriesRoutes.js"; 
import importRoutes from "./routes/importRoutes.js";
import personneRoutes from "./routes/personneRoutes.js";
import logRoutes from "./routes/logRoutes.js";
import adminMessageRoutes from "./routes/adminMessageRoutes.js";
import adminBackupRoutes from "./routes/adminBackupRoutes.js";
import sagaRoutes from "./routes/sagaRoutes.js";
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { prisma as db } from "./services/db.js";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { Server as SocketIOServer } from "socket.io"; 
import cron from 'node-cron';
import { rotateGenreFeaturedContent } from './services/genreFeaturedContentService.js';
import { createDatabaseBackup } from './services/databaseBackupService.js';

// URL publique
const PUBLIC_URL = process.env.PUBLIC_URL;
// Host publique
const PUBLIC_HOST = process.env.PUBLIC_HOST;

// Créer l'équivalent de __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lire les fichiers de certificat SSL
let privateKey, certificate;
try {
    console.log('Reading SSL certificate files...');
    privateKey = fs.readFileSync(path.join('ssl/private.key'));
    certificate = fs.readFileSync(path.join('ssl/certificate.crt'));
    console.log('SSL certificate files read successfully.');
} catch (err) {
    console.error('Error reading SSL certificate files:', err);
    process.exit(1);
}
// Création d'une instance de Fastify avec le logger activé pour un suivi des requêtes et erreurs
const fastify = Fastify({
    https: {
        key: privateKey,
        cert: certificate
    },
    // Activation du logger pour journaliser les requêtes et les erreurs
    // logger: {
    //     level: 'info', // Niveau de journalisation (info, warn, error)
    //     transport: {
    //         target: 'pino-pretty', // Utiliser pino-pretty pour un affichage plus lisible dans la console
    //         options: {
    //             translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
    //             ignore: 'pid,hostname',
    //         },
    //     },
    // },

    // Configuration de l'instance AJV (JSON Schema Validator) intégrée de Fastify
    ajv: {
        customOptions: { 
            removeAdditional: true // Supprime les propriétés non définies dans le schéma
        }
    }
});


const io = new SocketIOServer(fastify.server, { 
    cors: { 
      origin: PUBLIC_URL, 
      methods: ["GET", "POST"], 
    }, 
  }); 
  
  fastify.decorate("io", io); 

// Enregistrement de la documentation Swagger avec Swagger-UI
fastify.register(fastifySwagger, {
    openapi: {
        info: {
            title: 'VEHICLE API',
            description: 'API pour l\'application VEHICLE, Application web pour stocker et accéder facilement aux informations de mes véhicules sur un serveur personnel depuis tous mes appareils.',
            version: '1.0.0'
        },
        externalDocs: {
            url: 'https://swagger.io',
            description: 'Find more info here'
        },
        host: PUBLIC_HOST,
        schemes: ['https'], // Utiliser https au lieu de http
        consumes: ['application/json'],
        produces: ['application/json'],
        components: {
            securitySchemes: {
                token: {
                    type: "https",
                    scheme: "bearer",
                    bearerFormat: "jwt",
                }
            }
        },
    },
});

fastify.register(fastifySwaggerUI, {
    routePrefix: '/documentation',
    uiConfig: {
        docExpansion: 'list'
    }
});

// Configurer CORS
fastify.register(fastifyCors, {
    origin: PUBLIC_URL, // Autoriser les requêtes depuis cette origine
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Backup-Filename'],
});

// Enregistrement du plugin multipart
fastify.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // Limite à 50 Go
});

// Enregistrer les routes
fastify.register(userRoutes, { prefix: '/api/users' });
fastify.register(videoRoutes, { prefix: "/api/videos" }); 
fastify.register(genreRoutes, { prefix: "/api/genres" }); 
fastify.register(seriesRoutes, { prefix: "/api/series" }); 
fastify.register(importRoutes, { prefix: "/api/import" }); 
fastify.register(personneRoutes, { prefix: "/api/people" });
fastify.register(logRoutes, { prefix: "/api/logs" });
fastify.register(adminMessageRoutes, { prefix: "/api/admin-message" });
fastify.register(adminBackupRoutes, { prefix: "/api/admin-backup" });
fastify.register(sagaRoutes, { prefix: "/api/sagas" });

// Enregistrer les fichiers statiques pour le frontend
fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../frontend/build'),
    prefix: '/', // Frontend accessible depuis la racine
    wildcard: true, // Permet de gérer React Router
    decorateReply: false, // Désactive l'ajout du décorateur "sendFile"
});

// Enregistrer les fichiers statiques pour les uploads
fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/', // Fichiers utilisateurs accessibles depuis /uploads/
});

// Gérer toutes les autres routes non définies (React Router support)
fastify.setNotFoundHandler((request, reply) => {
    reply.sendFile('index.html', path.join(__dirname, '../frontend/build'));
});

// Fonction pour garder la connexion à la base de données active
function keepDatabaseAlive() {
    db.$queryRaw`SELECT 1` // Utilise la syntaxe de requête brute de Prisma
        .then(() => {
            console.log("Ping à la base de données réussi");
        })
        .catch((err) => {
            console.error("Erreur lors du ping de la base de données :", err.message);
        });
}

// Configurer l'intervalle de ping (toutes les 7 heures)
setInterval(keepDatabaseAlive, 25200000);

// Fonction pour créer une sauvegarde de la base de données
async function backupDatabase() {
    try {
        const backup = await createDatabaseBackup({ kind: "auto" });
        fastify.log.info(`Sauvegarde créée avec succès : ${backup.filePath}`);
    } catch (error) {
        fastify.log.error(`Erreur lors de la sauvegarde : ${error.message}`);
    }
}

// Planifier la tâche hebdomadaire
const backupDayOfWeek = process.env.BACKUP_DAY_OF_WEEK || '0'; // 0 pour dimanche ('1' = lundi...)
const backupTime = process.env.BACKUP_TIME || '00:00'; // Heure par défaut : minuit
const [hours, minutes] = backupTime.split(':');

cron.schedule(`${minutes} ${hours} * * ${backupDayOfWeek}`, () => {
    console.log('Démarrage de la sauvegarde hebdomadaire...');
    backupDatabase();
});

cron.schedule('0 9 * * 1', async () => {
    console.log("Démarrage de la rotation hebdomadaire des contenus à la une...");
    try {
        const result = await rotateGenreFeaturedContent();
        console.log(`Rotation des contenus à la une terminée pour ${result.genres.length} genres.`);
    } catch (error) {
        console.error("Erreur lors de la rotation des contenus à la une :", error);
    }
});

// Démarrer le serveur
const start = async () => {
    try {
        console.log(`Starting server on port ${process.env.PORTS}...`);
        await fastify.listen({ port: process.env.PORTS, host: '0.0.0.0' });
        console.log(`Server listening on ${process.env.HTTPS}:${process.env.PORTS}`);
    } catch (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
};
start();
