# SAMI

SAMI (**Système d’Archivage Multimédia Intégré**) est une médiathèque web privée permettant d’organiser, diffuser et suivre des films, séries et musiques depuis une seule interface.

La version actuelle est la **7.8.0**. Elle repose sur un backend Fastify, une interface React, Prisma avec MySQL, un pipeline vidéo FFmpeg/HLS et Socket.IO pour le retour en temps réel des traitements.

## Fonctionnalités

### Vidéo

- catalogue de films et de séries, saisons et épisodes ;
- lecture HLS avec choix de la qualité, sous-titres et éclairage d’ambiance ;
- pistes audio multiples expérimentales pour les nouvelles vidéos importées, avec choix dans le lecteur ;
- lecteur personnalisé avec progression lue, buffer, volume et plein écran ;
- **Preview Live** expérimentale : aperçu au survol de la barre de lecture à partir de spritesheets et d’un fichier WebVTT ;
- import et transcodage FFmpeg avec suivi de progression via Socket.IO ;
- export sécurisé et reprenable d’une vidéo traitée depuis un clone vers l’instance principale ;
- historique de lecture, reprise intelligente et remise à zéro d’une série ;
- tendances, calendrier des ajouts et contenus mis en avant par genre ;
- favoris, sagas et univers.

### Musique

- catalogue de morceaux et d’albums ;
- genres musicaux et contenus premium ;
- lecteur audio flottant et persistant pendant la navigation ;
- gestion et import des contenus depuis l’administration.

### Utilisateurs et administration

- authentification JWT par cookie HttpOnly ;
- profils utilisateur, grades, premium et préférences de genres ;
- espaces protégés pour les administrateurs et super administrateurs ;
- gestion des vidéos, séries, genres, personnes, sagas, univers et musiques ;
- messages généraux, fonctionnalités expérimentales et statistiques ;
- journalisation des actions et sauvegardes manuelles ou planifiées de MySQL ;
- limitations de requêtes, contrôle CORS et en-têtes de sécurité.

## Nouveautés de la version 7.8.0

- export sécurisé et reprenable d’une vidéo traitée depuis un clone vers le serveur principal ;
- accès réservé au super administrateur depuis la page de lecture, avec confirmation locale du mot de passe ;
- sélection des genres et d’une éventuelle saison existante directement depuis le catalogue principal ;
- échanges inter-serveurs signés par HMAC-SHA-256 et vérification SHA-256 de chaque fichier ;
- réception atomique dans un stockage temporaire avec vidéo bloquée jusqu’à la validation complète du HLS ;
- progression persistante, reprise, annulation et journalisation des étapes sur les deux instances ;
- migration corrective du modèle `Log` pour les clones dont l’historique Prisma était incomplet.

L’historique complet des versions, de la 6.1.0 à la 7.8.0, est disponible dans l’application à l’adresse `/updates` et dans `frontend/src/components/UpdatesPage.js`.

## Stack technique

| Couche | Technologies |
| --- | --- |
| Frontend | React 18, React Router, Tailwind CSS 4, Axios, Hls.js, Socket.IO Client |
| Backend | Node.js, Fastify 5, Socket.IO, Swagger/OpenAPI |
| Données | MySQL, Prisma 6 |
| Médias | FFmpeg, HLS, WebVTT, stockage local |
| Tests | Vitest, React Testing Library |

## Architecture

```text
sami/
├── backend/
│   ├── controllers/        # Logique des endpoints
│   ├── middlewares/        # Authentification, autorisations et sécurité
│   ├── prisma/             # Schéma Prisma, seed et ERD
│   ├── routes/             # Déclaration des routes Fastify
│   ├── server/             # Fabrique et démarrage du serveur
│   ├── services/           # Base, sauvegardes, favoris, médias et tâches métier
│   ├── tests/              # Tests Vitest du backend
│   ├── uploads/            # Médias générés ou importés, non versionnés
│   ├── BDD/                # Sauvegardes MySQL, non exposées publiquement
│   └── sami.js             # Point d’entrée HTTPS
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/     # Pages et composants React
│       ├── context/        # Navigation et lecteur musical
│       ├── services/       # Client API
│       ├── utils/          # Utilitaires, dont le parseur Preview Live
│       └── App.js          # Routes et structure générale de l’application
└── README.md
```

`backend/sami.js` lance le serveur TLS sur `0.0.0.0`. La configuration commune — routes, sécurité, CORS, multipart, fichiers statiques, Socket.IO et Swagger — se trouve dans `backend/server/createServer.js`.

## Modèle de données

Le schéma Prisma décrit notamment :

- les utilisateurs, grades, états et journaux d’actions ;
- les vidéos, pistes audio, sous-titres, séries, saisons et progressions de lecture ;
- les genres, préférences utilisateur et contenus mis en avant ;
- les favoris de films et de séries ;
- les sagas, univers et leur ordre de lecture ;
- les personnes associées aux films et séries ;
- les morceaux, albums et genres musicaux ;
- les messages administratifs et réglages globaux de l’application.

Le fichier source est `backend/prisma/schema.prisma`. Un diagramme est également disponible dans `backend/prisma/ERD.svg`.

## Prérequis

- Node.js 18 ou une version plus récente ;
- npm ;
- une base MySQL accessible ;
- `ffmpeg` et `ffprobe` pour analyser et convertir les médias ;
- `mysqldump` pour les sauvegardes de la base ;
- un certificat et une clé TLS pour le démarrage avec `backend/sami.js`.

## Installation

Clonez le dépôt, puis installez séparément les dépendances du backend et du frontend :

```bash
git clone https://github.com/alexanderworldercraft/SAMI.git
cd SAMI

cd backend
npm install
npx prisma generate

cd ../frontend
npm install
```

## Configuration

Créez les fichiers d’environnement à partir des exemples :

```bash
cp backend/.env.exemple backend/.env
cp frontend/.env.exemple frontend/.env
```

Les principales variables du backend sont :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | URL de connexion Prisma à MySQL |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Connexion utilisée notamment par les sauvegardes |
| `JWT_SECRET` | Signature des jetons d’authentification |
| `NODE_ENV` | Environnement d’exécution ; doit valoir `production` sur les serveurs déployés |
| `APP_NAME` | Nom affiché au démarrage |
| `PORTS` | Port d’écoute du backend |
| `PUBLIC_URL`, `PUBLIC_HOST` | URL et hôte publics, utilisés par CORS, Socket.IO et Swagger |
| `SAMI_INSTANCE_ROLE` | Rôle de l’installation : `clone` pour exporter ou `primary` pour recevoir |
| `SAMI_INSTANCE_ID` | Identifiant stable et unique de l’installation, utilisé pour l’idempotence |
| `SAMI_PRIMARY_BASE_URL` | URL configurable de l’instance principale ; l’exemple utilise `https://sami.worldercraft.fr` |
| `SAMI_TRANSFER_SHARED_SECRET` | Secret partagé servant à signer les échanges inter-serveurs avec HMAC-SHA-256 |
| `SAMI_TRANSFER_REQUEST_TIMEOUT_MS` | Délai maximal d’une requête de transfert |
| `SAMI_TRANSFER_SESSION_TTL_HOURS` | Durée de conservation d’une réception incomplète avant nettoyage |
| `SAMI_TRANSFER_CONCURRENCY` | Nombre maximal de fichiers envoyés simultanément par un clone |
| `BACKUP_DAY_OF_WEEK`, `BACKUP_TIME` | Planification de la sauvegarde MySQL |
| `SMTP_*` | Envoi d’e-mails |
| `USERNAMESUPERADMIN`, `PASSWORDSUPERADMIN`, `EMAILSUPERADMIN` | Compte super administrateur créé par le seed |

Le frontend utilise principalement `REACT_APP_URL_LOCAL`, `REACT_APP_NAME` et `REACT_APP_VER`.

Ne versionnez jamais les fichiers `.env`, les secrets, les certificats privés ou les sauvegardes de production.

### Transfert d’une vidéo depuis un clone

Le même code est déployé sur chaque installation. L’instance principale utilise
`SAMI_INSTANCE_ROLE=primary`; chaque clone utilise `SAMI_INSTANCE_ROLE=clone`, un
`SAMI_INSTANCE_ID` distinct et `SAMI_PRIMARY_BASE_URL` pour joindre le principal.
Les deux côtés doivent partager un secret aléatoire d’au moins 32 octets dans
`SAMI_TRANSFER_SHARED_SECRET`.

Configuration minimale du clone :

```dotenv
NODE_ENV="production"
SAMI_INSTANCE_ROLE="clone"
SAMI_INSTANCE_ID="sami-clone-01"
SAMI_PRIMARY_BASE_URL="https://sami.worldercraft.fr"
SAMI_TRANSFER_SHARED_SECRET="<même-secret-fort-sur-les-deux-serveurs>"
```

Configuration minimale du principal :

```dotenv
NODE_ENV="production"
SAMI_INSTANCE_ROLE="primary"
SAMI_INSTANCE_ID="sami-primary"
SAMI_PRIMARY_BASE_URL="https://sami.worldercraft.fr"
SAMI_TRANSFER_SHARED_SECRET="<même-secret-fort-sur-les-deux-serveurs>"
```

Exemple de génération du secret, à copier ensuite dans les deux environnements :

```bash
openssl rand -hex 32
```

Avant d’activer la fonctionnalité, sauvegardez les deux bases. Déployez et
redémarrez d’abord le principal, puis le clone afin que l’API de réception soit
disponible lorsque le clone démarre. Dans chaque copie du backend :

```bash
cd backend
npm ci
npx prisma generate --generator client
npx prisma migrate deploy
npx prisma migrate status
```

La commande `migrate status` doit confirmer que toutes les migrations sont
appliquées avant le redémarrage du processus. `prisma generate` régénère
uniquement le client JavaScript et ne modifie jamais MySQL. `migrate deploy`
conserve les données et applique seulement les migrations versionnées qui ne
figurent pas encore dans `_prisma_migrations` ; il ne recrée pas une base
existante.

Depuis `/lecture/:id`, le super administrateur du clone peut confirmer son mot de
passe local, choisir les genres et éventuellement une saison existant sur le
principal, puis lancer l’export. Le mot de passe ne quitte jamais le clone. Les
fichiers sont reçus dans un espace non public, vérifiés par taille et SHA-256,
puis publiés sous `uploads/video/<VideoID>` uniquement lorsque le manifeste HLS
est complet. La vidéo principale reste bloquée et invisible jusqu’à cette
validation. Les tâches sont persistées afin de permettre le suivi, l’annulation
et la reprise après une interruption.

Le reverse proxy du principal doit autoriser les requêtes `PUT` vers
`/api/internal/video-transfers/`, désactiver leur mise en mémoire complète et
accorder un délai et une taille de corps suffisants aux segments HLS. Exemple
de directives Nginx à intégrer dans la location correspondante :

```nginx
client_max_body_size 0;
proxy_request_buffering off;
proxy_read_timeout 900s;
proxy_send_timeout 900s;
```

Une limite explicite supérieure à la taille maximale de vos segments peut
remplacer `0`. Ces routes restent protégées par la signature HMAC,
l’horodatage et un nonce anti-rejeu ; elles ne doivent jamais être remplacées
par une route publique d’import de métadonnées.

Les verrous de job et le cache anti-rejeu sont locaux au processus Node. Chaque
installation SAMI doit donc exécuter un seul processus backend pour cette
version (pas de cluster PM2 ni de réplicas parallèles) ; un déploiement
multi-process nécessiterait des verrous et un cache de nonces partagés via la
base ou Redis.

## Initialisation locale ou d’une base neuve

Après avoir configuré `DATABASE_URL` :

```bash
cd backend
npx prisma db push
npm run seed
```

`prisma db push` synchronise directement le schéma avec la base. Pour un environnement géré par migrations, utilisez plutôt le workflow Prisma adapté à votre déploiement.

N’utilisez jamais `prisma db push` sur les bases du clone ou du principal en
production. Utilisez la procédure `prisma migrate deploy` décrite ci-dessus.

## Développement

Lancez le frontend :

```bash
cd frontend
npm start
```

Dans un autre terminal, lancez le backend HTTPS :

```bash
cd backend
npm start
```

Le point d’entrée attend les fichiers suivants :

```text
backend/ssl/private.key
backend/ssl/certificate.crt
```

L’interface de développement React utilise `REACT_APP_URL_LOCAL` pour joindre l’API.

## Production

Vérifiez que `NODE_ENV=production` est défini sur le principal et sur chaque
clone avant de démarrer les processus.

Construisez d’abord l’interface :

```bash
cd frontend
npm run build
```

Puis démarrez Fastify :

```bash
cd ../backend
npm start
```

Fastify sert le build React depuis `frontend/build`, les médias depuis `/uploads/` et l’application React pour les routes inconnues. Les sauvegardes placées dans `backend/BDD` ne sont pas publiées par le serveur statique.

La documentation de l’API est accessible à l’adresse :

```text
https://<hôte>:<port>/documentation
```

## Routes de l’application

| Route | Accès | Description |
| --- | --- | --- |
| `/` | public | Accueil |
| `/login` | public | Connexion |
| `/updates` | public | Historique des mises à jour |
| `/videos` | authentifié | Films et séries |
| `/lecture/:id` | authentifié | Lecteur vidéo |
| `/sagas` | authentifié | Sagas |
| `/musique` | authentifié | Musique et lecteur persistant |
| `/personnes` | authentifié | Personnes associées aux contenus |
| `/profile`, `/settings` | authentifié | Profil et préférences |
| `/administration` | administrateur | Gestion de la plateforme |
| `/nouvelle-video` | administrateur | Import vidéo |
| `/nouvelle-musique` | administrateur | Import musical |

La route `/register` est actuellement désactivée et renvoie vers l’écran de connexion.

## Préfixes de l’API

- `/api/users`
- `/api/videos`
- `/api/video-exports`
- `/api/internal/video-transfers` (échanges HMAC entre instances)
- `/api/genres`
- `/api/series`
- `/api/people`
- `/api/logs`
- `/api/admin-message`
- `/api/admin-backup`
- `/api/app-settings`
- `/api/sagas`
- `/api/universes`
- `/api/music`

## Tests

Backend :

```bash
cd backend
npm test
```

Frontend :

```bash
cd frontend
npm test -- --watchAll=false
```

Build de vérification :

```bash
cd frontend
npm run build
```

Les tests couvrent notamment la configuration Fastify, certaines routes, le calendrier, le pipeline vidéo, Preview Live, le parseur WebVTT et le lecteur personnalisé.

## Tâches automatiques

Au démarrage, le backend :

- vérifie la connexion MySQL puis la maintient active périodiquement ;
- planifie une sauvegarde selon `BACKUP_DAY_OF_WEEK` et `BACKUP_TIME` ;
- renouvelle chaque lundi à 9 h les contenus mis en avant par genre ;
- arrête proprement ses minuteries et tâches planifiées à la fermeture.

## Données locales et fichiers sensibles

Les éléments suivants ne doivent pas être publiés dans Git :

- `node_modules/` ;
- `frontend/build/` ;
- `backend/uploads/` ;
- les sauvegardes SQL de `backend/BDD/` ;
- les fichiers `.env` ;
- les clés privées et certificats réels ;
- les journaux, caches et fichiers temporaires.

Les exemples `.env.exemple` doivent rester exempts de secrets réels.

## Licence

Projet personnel. Aucune licence de redistribution spécifique n’est actuellement déclarée pour l’ensemble du dépôt.
