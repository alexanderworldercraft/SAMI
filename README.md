# SAMI

SAMI, pour **Systeme d'Archivage Multimedia Integre**, est une application web personnelle de gestion et de lecture de contenus multimedia. Le projet regroupe un backend Fastify/Prisma, un frontend React, une base MySQL, une gestion des utilisateurs, des series, des videos, des genres, des personnes, des historiques de lecture et des contenus mis en avant.

Ce depot remplace l'ancien depot SAMI obsolète. La base technique a ete reprise depuis le projet Vehicle, puis refondue pour devenir une application multimedia complete : nouvelles routes metier, nouveau schema Prisma, interface React dediee, suivi de lecture, administration, imports, tendances, contenus a la une et reprise intelligente.

## Etat actuel

La page `UpdatesPage.js` documente les changements recents de l'application. La version actuelle met notamment en avant :

- **6.3.1 - Reprise d'accueil plus intelligente** : priorite aux videos en cours, reprise du prochain episode de la serie la plus recente, puis fallback sur les tendances des 30 derniers jours.
- **6.2.0 - Listes par genre avec contenu a la une** : sections par genre retravaillees, contenu mis en avant, rotation automatique chaque lundi a 9h00 et action manuelle d'administration.
- **6.1.1 - Tendances sur l'accueil** : remplacement de l'ancien bloc des plus regardes par une section tendances avec mise en page dediee.
- **6.1.0 - Recommencer une serie** : remise a zero du statut de visionnage d'une serie sans supprimer l'historique global.

## Stack

- Backend : Node.js, Fastify, Prisma, Socket.IO, Swagger UI.
- Frontend : React, React Router, Tailwind CSS, Axios, HLS.js.
- Base de donnees : MySQL via Prisma.
- Media : stockage local dans `backend/uploads`, non versionne dans git.

## Structure

```text
backend/
  controllers/       Logique metier des routes API
  middlewares/       Authentification JWT
  prisma/            Schema, migrations et seed
  routes/            Routes Fastify
  services/          Prisma et services recurrents
  sami.js            Point d'entree du serveur

frontend/
  public/            Assets publics
  src/               Application React
```

## Prerequis

- Node.js 18 ou plus recent.
- npm.
- MySQL accessible localement ou sur serveur.
- `ffmpeg` installe sur la machine qui traite les videos.
- `mysqldump` disponible si la sauvegarde automatique de la base est utilisee.
- Certificats SSL dans `backend/ssl/private.key` et `backend/ssl/certificate.crt`.

## Configuration

Les vrais fichiers `.env` ne doivent pas etre versionnes. Utiliser les exemples fournis :

```bash
cp backend/.env.exemple backend/.env
cp frontend/.env.exemple frontend/.env
```

Adapter ensuite les valeurs a l'environnement local ou de production.

## Installation backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run seed
```

En developpement, `npx prisma migrate dev` peut remplacer `migrate deploy` si de nouvelles migrations doivent etre creees.

## Installation frontend

```bash
cd frontend
npm install
npm run build
```

Le serveur Fastify sert ensuite le build React depuis `frontend/build`.

## Demarrage

```bash
cd backend
npm run start
```

L'application est exposee sur l'adresse configuree avec `HTTPS` et `PORTS`. La documentation Swagger est disponible sur :

```text
https://<host>:<port>/documentation
```

## Routes principales

- `/api/users` : comptes, login, profils, premium, historique utilisateur.
- `/api/videos` : videos, episodes, progression, tendances, imports media.
- `/api/series` : series, saisons, episodes, remise a zero de visionnage.
- `/api/genres` : genres et contenus a la une.
- `/api/import` : import et traitement des fichiers.
- `/api/people` : personnes liees aux contenus.
- `/api/logs` : journalisation et statistiques.

## Donnees non versionnees

Le depot doit rester centre sur le code source. Les elements suivants sont exclus :

- `archives/`
- `node_modules/`
- `frontend/build/`
- `backend/uploads/`
- fichiers `.env`
- certificats et cles SSL reels
- logs, caches et fichiers temporaires

Les fichiers d'exemple `.env.exemple` restent versionnes pour documenter la configuration attendue.

## Mise a jour du depot GitHub

Le depot cible est :

```text
https://github.com/alexanderworldercraft/SAMI3.git
```

La prochaine publication doit repartir d'une base propre avec ce projet SAMI actuel, sans l'ancien historique distant, sans `archives/`, sans `.env` et sans donnees locales. Le depot GitHub devra aussi etre renomme de `SAMI3` vers `SAMI`.
