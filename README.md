# SAMI

SAMI (**Système d’Archivage Multimédia Intégré**) est une médiathèque web privée permettant d’organiser, diffuser et suivre des films, séries et musiques depuis une seule interface.

La version actuelle est la **7.13.0**. Elle repose sur un backend Fastify, une interface React, Prisma avec MySQL, un pipeline vidéo FFmpeg/HLS et Socket.IO pour le retour en temps réel des traitements.

## Fonctionnalités

### Vidéo

- catalogue de films et de séries, saisons et épisodes ;
- lecture HLS avec choix de la qualité, sous-titres et éclairage d’ambiance classique ou avancé, personnalisé par compte ;
- pistes audio multiples expérimentales pour les nouvelles vidéos importées, avec choix dans le lecteur ;
- lecteur personnalisé avec progression lue, buffer, volume et plein écran ;
- aperçus Open Graph et Twitter spécifiques aux pages `/lecture/:id`, y compris pour les épisodes ;
- **Preview Live** expérimentale : aperçu au survol de la barre de lecture à partir de spritesheets et d’un fichier WebVTT ;
- import et transcodage FFmpeg avec suivi de progression via Socket.IO ;
- encodage multi-server expérimental : une résolution par worker, redistribution dynamique et publication finale sur le serveur principal ;
- export sécurisé et reprenable d’une vidéo traitée depuis un clone vers l’instance principale ;
- historique de lecture, reprise intelligente et remise à zéro d’une série ;
- recherche tolérante aux accents, séparateurs et petites fautes de saisie pour les films et les séries ;
- tendances, calendrier des ajouts et contenus mis en avant par genre, avec une grille adaptée aux smartphones ;
- favoris, sagas et univers, avec des actions allégées au repos sur les affiches.

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
- annuaire et fiches publiques des personnes avec recherche du nom complet à 80 %, filmographie regroupée et aperçus de partage dédiés ;
- édition des personnes avec photos, suppression réversible et corbeille réservée au super administrateur ;
- association semi-automatique d’acteurs et réalisateurs à un film ou une série, avec création contrôlée et recherche des photos manquantes ;
- détection des personnes potentiellement dupliquées, enrichie par les contenus partagés, classement des doutes et fusion réservée au super administrateur ;
- messages généraux, fonctionnalités expérimentales et statistiques ;
- journalisation des actions et sauvegardes manuelles ou planifiées de MySQL ;
- limitations de requêtes, contrôle CORS et en-têtes de sécurité.

## Nouveautés de la version 7.13.0

- recherche de films et de séries normalisée et classée par pertinence, avec une tolérance de 80 % permettant notamment de rapprocher `Spider-Man` et `spider man` ;
- recherche des personnes par prénom et nom complets, dans les deux ordres, avec normalisation et similitude minimale de 80 % ;
- navigation plus fluide avec retour en haut sur les accès principaux, les liens du pied de page, les contenus aléatoires, les cartes de personnes et la fenêtre des sagas ;
- nouvelle page `/stats` regroupant les statistiques, le calendrier des ajouts et les cookies, avec la version affichée dans la sidebar ;
- boutons de favoris masqués au repos lorsqu’un contenu n’est pas encore favori et ralentissement des affiches de prévisualisation ;
- refonte responsive de l’annuaire et des fiches des personnes, avec films et séries regroupés entre réalisation et distribution, outils administrateur repliables et métadonnées sociales complètes ;
- grille des sélections par genre adaptée aux smartphones, avec la vedette en premier puis deux cartes par ligne ;
- détection des doublons enrichie par les contenus partagés et les petites fautes de saisie ;
- configuration SMTP contrôlée avec SSL/TLS sur le port 465 ou STARTTLS sur les autres ports.

L’historique complet des versions, de la 6.1.0 à la 7.13.0, est disponible dans l’application à l’adresse `/updates` et dans `frontend/src/components/UpdatesPage.js`.

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
- le registre, les jobs, les tâches, les leases, les tentatives et les artefacts de l’encodage vidéo distribué.

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
| `APP_NAME` | Nom affiché au démarrage et dans les aperçus sociaux servis par le backend |
| `PORTS` | Port d’écoute du backend |
| `PUBLIC_URL`, `PUBLIC_HOST` | URL et hôte publics, utilisés par CORS, Socket.IO, Swagger et les URL canoniques des aperçus sociaux |
| `SAMI_INSTANCE_ROLE` | Rôle de l’installation : `clone` pour exporter ou `primary` pour recevoir |
| `SAMI_INSTANCE_ID` | Identifiant stable et unique de l’installation, utilisé pour l’idempotence |
| `SAMI_PRIMARY_BASE_URL` | URL configurable de l’instance principale ; l’exemple utilise `https://sami.worldercraft.fr` |
| `SAMI_TRANSFER_SHARED_SECRET` | Secret partagé servant à signer les échanges inter-serveurs avec HMAC-SHA-256 |
| `SAMI_TRANSFER_REQUEST_TIMEOUT_MS` | Délai maximal d’une requête de transfert |
| `SAMI_TRANSFER_SESSION_TTL_HOURS` | Durée de conservation d’une réception incomplète avant nettoyage |
| `SAMI_TRANSFER_CONCURRENCY` | Nombre maximal de fichiers envoyés simultanément par un clone |
| `SAMI_DISTRIBUTED_ENCODING_ENABLED` | Kill switch serveur de l’encodage distribué, à activer sur le primary et chaque clone après le déploiement |
| `SAMI_DISTRIBUTED_ENCODING_PIPELINE_VERSION` | Version de pipeline qui doit être identique sur tous les workers |
| `SAMI_DISTRIBUTED_ENCODING_ARTIFACT_RETENTION_DAYS` | Durée de conservation des lignes `VideoEncodingArtifactFile` terminées sur le primary, 1 jour par défaut |
| `SAMI_DISTRIBUTED_ENCODING_JOB_RETENTION_DAYS` | Durée de conservation des jobs terminés et de leurs tâches/tentatives, 30 jours par défaut |
| `SAMI_DISTRIBUTED_ENCODING_SOURCE_ROOT` | Stockage privé optionnel des sources sur le primary |
| `SAMI_DISTRIBUTED_ENCODING_CACHE_ROOT` | Cache privé optionnel des sources sur un clone, plafonné à 50 Gio |
| `SAMI_DISTRIBUTED_ENCODING_STAGING_ROOT` | Staging privé optionnel des artefacts et tentatives |
| `FFMPEG_PATH`, `FFPROBE_PATH` | Chemins optionnels des exécutables, utiles notamment sous Windows |
| `BACKUP_DAY_OF_WEEK`, `BACKUP_TIME` | Planification de la sauvegarde MySQL |
| `SMTP_*` | Envoi d’e-mails ; le port 465 active SSL/TLS, les autres ports utilisent STARTTLS |
| `USERNAMESUPERADMIN`, `PASSWORDSUPERADMIN`, `EMAILSUPERADMIN` | Compte super administrateur créé par le seed |

Le frontend utilise principalement `REACT_APP_URL_LOCAL`, `REACT_APP_NAME` et `REACT_APP_VER`.
Pour que les aperçus de partage restent cohérents, `APP_NAME` et `REACT_APP_NAME`
doivent porter le même nom, et `PUBLIC_URL` doit contenir en premier l'origine HTTPS
publique qui sert l'application.

Ne versionnez jamais les fichiers `.env`, les secrets, les certificats privés ou les sauvegardes de production.

### Encodage vidéo multi-server expérimental

Le primary reçoit la source depuis la page `/nouvelle-video`, construit le plan
d’encodage et attribue au maximum une tâche à chaque worker. Au lancement, le
clone ayant la priorité de performance la plus élevée reçoit la résolution la
plus lourde, les clones suivants reçoivent les profils suivants, puis le primary
reçoit en dernier le plus petit profil encore disponible. Dès qu’un worker termine,
il réclame la prochaine tâche compatible. Le primary est normalement limité à
360p ; il ne peut prendre un profil plus grand qu’après cinq minutes continues
sans heartbeat ni progression d’un clone compatible.

Les clones n’ont pas besoin d’être publiquement joignables : ils ouvrent les
connexions vers `SAMI_PRIMARY_BASE_URL`. La source est reprise par `Range`,
contrôlée par taille et SHA-256, épinglée pendant l’encodage et conservée dans un
cache privé LRU plafonné à 50 Gio. Une réussite ou une annulation déclenche sa
purge ; une source en échec peut être conservée vingt-quatre heures. Les sorties
reviennent dans un staging non public du primary et ne deviennent visibles
qu’après vérification et publication atomique du master HLS.

Le protocole réutilise `SAMI_TRANSFER_SHARED_SECRET`, sans jamais l’enregistrer
en base, mais signe les messages dans le domaine distinct
`SAMI-DISTRIBUTED-ENCODING-V1`. Les `SAMI_INSTANCE_ID` sont comparés avec leur
casse exacte et doivent être inscrits dans le registre depuis la page
Fonctionnalités expérimentales. Le réglage applicatif est désactivé par défaut ;
le couper empêche les nouveaux jobs mais laisse finir ceux déjà lancés.

Configuration minimale du primary :

```dotenv
NODE_ENV="production"
SAMI_INSTANCE_ROLE="primary"
SAMI_INSTANCE_ID="sami-primary"
SAMI_PRIMARY_BASE_URL="https://sami.worldercraft.fr"
SAMI_TRANSFER_SHARED_SECRET="<même-secret-fort-sur-toutes-les-instances>"
SAMI_DISTRIBUTED_ENCODING_ENABLED="true"
SAMI_DISTRIBUTED_ENCODING_PIPELINE_VERSION="sami-hls-libx264-aac-v1"
SAMI_DISTRIBUTED_ENCODING_ARTIFACT_RETENTION_DAYS="1"
SAMI_DISTRIBUTED_ENCODING_JOB_RETENTION_DAYS="30"
```

Sur le primary, la purge s'exécute au démarrage puis pendant la maintenance
horaire. Elle conserve toujours les jobs actifs ou encore récupérables. Les
lignes d'artefacts des jobs terminés sont supprimées en premier, puis la
suppression d'un job expiré retire en cascade ses tâches, ses tentatives et les
éventuels artefacts restants.

Configuration minimale d’un clone :

```dotenv
NODE_ENV="production"
SAMI_INSTANCE_ROLE="clone"
SAMI_INSTANCE_ID="Sami-clone-macbookair15"
SAMI_PRIMARY_BASE_URL="https://sami.worldercraft.fr"
SAMI_TRANSFER_SHARED_SECRET="<même-secret-fort-sur-toutes-les-instances>"
SAMI_DISTRIBUTED_ENCODING_ENABLED="true"
SAMI_DISTRIBUTED_ENCODING_PIPELINE_VERSION="sami-hls-libx264-aac-v1"
```

Enregistrez ensuite exactement `Sami-clone-macbookair15`,
`Sami-clone-pcfixe` et tout futur clone, par exemple
`Sami-clone-aero15XC`. Configurez une priorité plus élevée pour la machine la
plus rapide. Chaque worker doit disposer de `ffmpeg` avec les encodeurs
`libx264` et `aac`, de `ffprobe`, d’un seul slot et d’au moins 100 Gio d’espace
temporaire recommandé.

Avant l’activation, sauvegardez les bases puis déployez et migrez d’abord le
primary. Déployez ensuite les clones, vérifiez leurs heartbeats dans le registre,
puis activez le réglage expérimental. La migration ne l’active jamais
automatiquement. Utilisez un seul processus backend par instance dans cette
version : la promotion locale des artefacts et la capacité FFmpeg sont
coordonnées dans le processus Node.

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
`/api/internal/video-transfers/` et `/api/internal/video-encoding/`, désactiver
leur mise en mémoire complète et accorder un délai et une taille de corps
suffisants aux segments HLS. Exemple de directives Nginx à intégrer dans les
locations correspondantes :

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
| `/personnes/:id` | authentifié | Fiche, filmographie et aperçu de partage d’une personne |
| `/profile`, `/settings` | authentifié | Profil et préférences |
| `/administration` | administrateur | Gestion de la plateforme |
| `/nouvelle-video` | administrateur | Import vidéo |
| `/nouvelle-musique` | administrateur | Import musical |

La route `/register` est actuellement désactivée et renvoie vers l’écran de connexion.

## Préfixes de l’API

- `/api/users`
- `/api/videos`
- `/api/video-exports`
- `/api/video-encoding` (configuration, registre et jobs superadmin)
- `/api/internal/video-transfers` (échanges HMAC entre instances)
- `/api/internal/video-encoding` (heartbeats, leases, sources et artefacts HMAC)
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
- reprend les leases, jobs et publications d’encodage distribué interrompus et nettoie les caches temporaires expirés ;
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
