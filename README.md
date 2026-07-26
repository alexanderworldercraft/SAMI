# SAMI

SAMI (**Système d’Archivage Multimédia Intégré**) est une médiathèque web privée permettant d’organiser, diffuser et suivre des films, séries et musiques depuis une seule interface.

La version actuelle est la **7.6.0**. Elle repose sur un backend Fastify, une interface React, Prisma avec MySQL, un pipeline vidéo FFmpeg/HLS et Socket.IO pour le retour en temps réel des traitements.

## Fonctionnalités

### Vidéo

- catalogue de films et de séries, saisons et épisodes ;
- lecture HLS avec choix de la qualité, sous-titres et éclairage d’ambiance ;
- pistes audio multiples expérimentales pour les nouvelles vidéos importées, avec choix dans le lecteur ;
- lecteur personnalisé avec progression lue, buffer, volume et plein écran ;
- **Preview Live** expérimentale : aperçu au survol de la barre de lecture à partir de spritesheets et d’un fichier WebVTT ;
- import et transcodage FFmpeg avec suivi de progression via Socket.IO ;
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

## Nouveautés de la version 7.6.0

- activation expérimentale des pistes audio multiples pour les nouvelles vidéos importées ;
- conservation de toutes les pistes dans des renditions HLS audio séparées ;
- sélection de la piste principale avec les préférences audio existantes ;
- nouveau menu de choix audio dans le lecteur Hls.js ;
- stockage des métadonnées dans `VideoAudioTrack`, sans rétrofit des anciennes vidéos ;
- ajout automatique du genre `MultiAudio` après une conversion multi-audio réussie ;
- maintien intégral du pipeline historique lorsque l’option est désactivée.

L’historique complet des versions, de la 6.1.0 à la 7.6.0, est disponible dans l’application à l’adresse `/updates` et dans `frontend/src/components/UpdatesPage.js`.

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
| `APP_NAME` | Nom affiché au démarrage |
| `PORTS` | Port d’écoute du backend |
| `PUBLIC_URL`, `PUBLIC_HOST` | URL et hôte publics, utilisés par CORS, Socket.IO et Swagger |
| `BACKUP_DAY_OF_WEEK`, `BACKUP_TIME` | Planification de la sauvegarde MySQL |
| `SMTP_*` | Envoi d’e-mails |
| `USERNAMESUPERADMIN`, `PASSWORDSUPERADMIN`, `EMAILSUPERADMIN` | Compte super administrateur créé par le seed |

Le frontend utilise principalement `REACT_APP_URL_LOCAL`, `REACT_APP_NAME` et `REACT_APP_VER`.

Ne versionnez jamais les fichiers `.env`, les secrets, les certificats privés ou les sauvegardes de production.

## Initialisation de la base

Après avoir configuré `DATABASE_URL` :

```bash
cd backend
npx prisma db push
npm run seed
```

`prisma db push` synchronise directement le schéma avec la base. Pour un environnement géré par migrations, utilisez plutôt le workflow Prisma adapté à votre déploiement.

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
- `/api/genres`
- `/api/series`
- `/api/import`
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
