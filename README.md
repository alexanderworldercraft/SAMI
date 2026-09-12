# SAMI

SAMI (**Système d’Archivage Multimédia Intégré**) est une médiathèque web privée permettant d’organiser, diffuser et suivre des films, séries et musiques depuis une seule interface.

La version actuelle est la **8.3.0**. Elle repose sur un backend Fastify, une interface React, Prisma avec MySQL, un pipeline vidéo FFmpeg/HLS et Socket.IO pour le retour en temps réel des traitements.

## Fonctionnalités

### Vidéo

- catalogue de films et de séries, saisons et épisodes ;
- lecture HLS avec choix de la qualité, sous-titres personnalisés désactivés par défaut et éclairage d’ambiance classique ou avancé, personnalisé par compte ;
- pistes audio multiples expérimentales pour les nouvelles vidéos importées, avec choix dans le lecteur ;
- lecteur personnalisé avec progression lue, buffer, volume et plein écran ;
- aperçus Open Graph et Twitter spécifiques aux pages `/lecture/:id`, y compris pour les épisodes ;
- **Preview Live** expérimentale : aperçu au survol de la barre de lecture à partir de spritesheets et d’un fichier WebVTT ;
- import et transcodage FFmpeg avec suivi de progression via Socket.IO ;
- encodage multi-server expérimental : une résolution par worker, redistribution dynamique et publication finale sur le serveur principal ;
- sous-titres IA locaux expérimentaux : français automatique pour les nouveaux imports qui en sont dépourvus, quinze langues à la demande, catalogue administratif recherché et regroupé par vidéo, correction textuelle ou temporelle et affectation complète au meilleur worker disponible ;
- doublages IA locaux distribués en anglais, français et japonais, avec calcul Qwen3-TTS sur clone NVIDIA, séparation de l'ambiance, profils vocaux verrouillés entre extrait et piste complète, filigrane audio et double validation administrative avant publication ;
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

## Nouveautés de la version 8.3.0

- propositions de plusieurs génériques par vidéo, avec saisie des bornes et capture de la position actuelle du lecteur ;
- modification ou suppression par leur auteur tant que les propositions sont en attente ;
- vérification, correction, validation et refus par les admins et superadmins depuis la fiche vidéo ou la nouvelle section de modération ;
- contrôle serveur de la durée et prévention des chevauchements entre génériques validés ;
- bouton « Passer le générique » pendant chaque intervalle validé ;
- bouton « Épisode suivant » à partir du dernier générique s’il commence après la moitié de la vidéo, avec un seuil de secours à 90 % en l’absence de générique validé après la moitié, passage entre saisons et démarrage à zéro ;
- harmonisation des textes et formulaires des génériques et du doublage avec les thèmes clair et sombre ;
- correction des URL des playlists HLS utilisées pour afficher la durée des épisodes.

La migration `20260911220000_add_video_credit_segments` doit être appliquée avant
le déploiement. Les détails sont dans la section « Génériques proposés par les utilisateurs » ci-dessous.

## Nouveautés de la version 8.2.0

- arrivée de la branche Voix après la vidéo et la musique, avec une bibliothèque dédiée et une section sur les fiches personnes ;
- ajout d’originaux indépendamment de toute génération, avec plusieurs références et langues par personne ;
- réutilisation des originaux autorisés pour créer des répliques IA, avec une présentation par défaut modifiable ;
- identification explicite des originaux et des audios IA, privés à la création et publiables séparément ;
- accès et écoute réservés aux utilisateurs connectés ayant accepté les conditions IA ; ajout, génération, publication et téléchargement réservés aux administrateurs et super administrateurs ;
- génération locale sur les clones compatibles, avec contrôles qualité et marquage audio ;
- prise en charge des Mac Apple Silicon et correction de la validation des chemins Windows ;
- texte limité à 500 caractères, avec 30 minutes par tentative et 100 minutes pour le traitement complet.

Les consignes de déploiement, la migration et les limites sont détaillées dans [la documentation de la bibliothèque de voix](backend/docs/voice-library.md).

L’historique complet des versions, de la 6.1.0 à la 8.3.0, est disponible dans l’application à l’adresse `/updates` et dans `frontend/src/components/UpdatesPage.js`.

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
- les messages administratifs et réglages globaux de l’application ;
- le registre des workers IA, les jobs de sous-titrage, leurs tentatives et les transcriptions réutilisables ;
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

### Doublage IA : références vocales guidées (V5 R4)

Le profil `sami-dubbing-v5-guided-references-r4` reprend les règles temporelles
de V5 R3 et ajoute des références manuelles facultatives. Il doit être configuré
à l'identique dans `SAMI_AI_DUBBING_PIPELINE_VERSION` sur le primary de test et
le clone. Les anciens profils restent disponibles et ne sont pas réécrits.

Dans l'administration du doublage, recherchez la vidéo par titre ou ID et
sélectionnez la langue cible. Laissez le nombre d'intervenants vide pour le mode
automatique. Sinon, « Générer l'extrait » ouvre la préparation guidée, sans créer
de job : écoutez la vidéo d'origine dans le lecteur protégé, puis délimitez
1 à 5 passages par intervenant, de 2 à 12 secondes chacun (3 secondes ou plus
recommandées). Chaque passage doit contenir une seule voix, sans couper les mots
ni chevaucher une autre sélection. Le dernier bouton lance le calcul.

Le moteur choisit la plus longue référence alignée entièrement dans ces bornes,
sans concaténer les prises. Il faut au moins deux secondes de mots alignés après
ajustement vers l'intérieur des bornes. Les autres passages restent des alternatives
pour « Régénérer ce profil » ; la référence rejetée est exclue, les autres profils
et leurs décisions déjà validées sont conservés. Si les alternatives sont épuisées,
il faut créer une nouvelle préparation guidée, sans repli sur un passage automatique.
Ajouter un intervenant à un job guidé nécessite également une nouvelle préparation.

Ces passages associent les identités détectées aux profils choisis ; ils ne constituent
pas une correction manuelle de tous les dialogues. Une association ambiguë, deux profils
correspondant à la même voix détectée, ou des alternatives contradictoires provoquent
un diagnostic explicite. La répartition des répliques reste à vérifier à l'écoute.

Déploiement : appliquer la migration `20260904170000_add_manual_voice_references`
sur la base du primary de test avec `npx prisma migrate deploy`, régénérer le client
Prisma avec `npx prisma generate --generator client`, transférer les scripts et services
du clone, activer R4-R2 sur les deux instances puis les redémarrer. Le primary doit aussi
recevoir les contrôleurs et le nouveau build frontend. Les sélections sont conservées
sur le job, transmises au clone et enregistrées dans le manifeste vocal privé.
La lecture du sélecteur utilise un manifeste HLS privé sans pistes IA, toujours soumis
à l'authentification et aux droits de lecture habituels.

La révision `sami-dubbing-v5-guided-references-r4-r1` conserve exactement ce
parcours et corrige le contrôle des répliques de quatre unités lexicales ou moins.
Le premier essai Qwen est déterministe ; jusqu'à deux essais échantillonnés sont
comparés ensuite si le contrôle ASR court est incertain. Si la durée reste valide,
une divergence CER courte sans expansion crédible est conservée comme avertissement
avec la meilleure tentative, car Whisper n'est pas assez fiable sur quelques
syllabes pour interrompre seul le rendu. L'absence de voix, la fin de média et une
expansion verbale plausible restent bloquantes. Les phrases plus longues conservent
le seuil V5 strict. R4 demeure disponible pour rejouer son comportement historique.

La révision `sami-dubbing-v5-guided-references-r4-r2` corrige le comptage des
contractions françaises et anglaises : `n'y`, `t'as`, `qu'il` ou `don't` comptent
comme une seule unité parlée. Cette règle est limitée à R4-R2 afin de préserver
les empreintes et résultats reproductibles des profils antérieurs.

### Doublage IA : traductions par propositions (V5 R5)

`sami-dubbing-v5-translated-clauses-r5` dérive de R4-R2, qui reste disponible
sans modification. En traduction uniquement, les changements de voix peuvent couper
le texte à la ponctuation, jamais à une position arbitraire dans un mot japonais
ou latin. L'attribution reste estimée d'après les durées, pas issue d'un alignement
forcé entre deux langues : chaque coupure est signalée à vérifier dans le rapport.
Sans assez de frontières, le sous-titre reste entier sur la voix dominante avec
un avertissement. Cela ne corrige ni une traduction source erronée ni tous les
changements d'intervenant ; une écoute de contrôle reste nécessaire.

Le parcours FR vers FR, les références guidées, les départs fixes, les fins flexibles
et les seuils CER de R4-R2 sont conservés. Une erreur CER sur une phrase longue
peut donc encore bloquer : R5 ne valide pas automatiquement une hallucination.
En cas de blocage vocal R5, `quality-failure.json` conserve les trois tentatives et
leurs transcriptions ; `quality-attempt-1.wav` à `quality-attempt-3.wav` contiennent
au maximum les 15 premières secondes de chaque rejet (PCM mono 24 kHz, 16 bits).
Le rapport indique si l'extrait est tronqué. Ces fichiers sont supprimés si la
réplique est finalement acceptée. Une capture audio impossible est signalée sans
masquer l'erreur initiale.

Les audios suivent le transfert signé existant vers
`backend/var/ai-dubbing/diagnostics/clones/<identité-hachée>/failure-<UUID>/`.
Ils restent privés, sans URL publique, avec vérification du format, des tailles et
des empreintes. La rétention reste de dix dossiers par clone ; les anciens rapports
JSON restent compatibles. Aucun média source complet n'est transféré par ce mécanisme.

Déployer les scripts et services sur les deux machines, **primary avant clone**
pour accepter les nouveaux diagnostics. Activer le même identifiant R5 sur les deux,
redémarrer les backends et reconstruire le frontend du primary pour les avertissements.
Aucune nouvelle migration R5. Recréer l'analyse/l'extrait : un profil vocal R4-R2 déjà
calculé conserve son ancien découpage et ne devient pas R5 en changeant seulement `.env`.
La régénération ciblée au sein d'un même profil conserve les autres références validées.
La validation GPU/Windows et l'écoute EN/JP complète restent à réaliser.

### Doublage IA : échantillons bornés (V5 R5-R1)

`sami-dubbing-v5-bounded-samples-r5-r1` conserve la R5, ses références manuelles,
son découpage et ses réglages Qwen pour un même texte. Il sélectionne pour les
échantillons des répliques entières de 8 secondes source et 120 caractères maximum,
de préférence proches de 4 secondes et sans attribution signalée incertaine.
Il ne découpe pas arbitrairement une phrase pour la faire entrer : faute de candidat,
l'analyse échoue explicitement. Un échantillon synthétisé supérieur à 20 secondes est
refusé, jamais tronqué pour être validé. Ces limites ne raccourcissent ni les références
de voix choisies par l'admin ni les dialogues du rendu complet.

Un superviseur Node impose 180 secondes par synthèse d'échantillon, 600 secondes par
tentative de réplique et 60 secondes pour le filigrane d'un échantillon. Il intervient
même si Python/CUDA reste occupé ; le délai ne se réinitialise pas avec le heartbeat.
L'arrêt vise l'arbre du runtime (`taskkill /T /F` sous Windows, groupe de processus
sous Unix), pas le backend. En cas d'échec de cette commande système, l'arrêt n'est
pas confirmé : un message terminal l'indique et le diagnostic ne peut être finalisé
avant la fermeture effective du runtime. Ne pas lancer de calcul concurrent alors.
Les dépassements sont non relançables automatiquement et ne produisent pas une piste
validée. Un lancement direct non supervisé de ce profil est refusé.

Le terminal du clone affiche l'intervenant, l'opération et le temps écoulé toutes
les 15 secondes. L'interface reçoit ce détail via le renouvellement du bail et son
rafraîchissement habituel ; ce compteur ne mesure pas les tokens ni la progression GPU.
`generation-attempt.json` est écrit avant l'appel : texte, langue, début source,
profil/empreinte, graine et référence pour la dernière synthèse, ou durée de l'audio
pour le marquage. Après une interruption forcée, son état peut rester `running` :
`error.json` indique alors le timeout. Il suit le transfert privé clone → primary
avec les diagnostics R5 existants, même si aucun WAV n'a été produit.

Déployer **scripts et services sur les deux machines**, primary avant clone, puis
le build frontend du primary. Mettre le même identifiant R5-R1 dans les deux `.env`
et redémarrer. Aucune migration supplémentaire, aucun modèle à télécharger.
Créer une nouvelle analyse R5-R1 avec les mêmes plages manuelles pour comparer :
un job R5 interrompu reste lié à R5, y compris s'il est remis en file après expiration
du bail. Changer `.env` ne le convertit pas. Les versions R5 et R4-R2 restent disponibles.
Les tests automatisés du superviseur ne remplacent pas la vérification sur Windows/3090.

### Doublage IA : comparaison japonaise ciblée (V5 R5-R2, expérimental)

`sami-dubbing-v5-japanese-identity-r5-r2` ajoute une variante **uniquement pour le
japonais** : Qwen reçoit l'identité vocale extraite du même WAV manuel, sans utiliser
le texte ni les codes de parole de la référence comme contexte de continuation
(`x_vector_only_mode=True`). Le texte cible et les plages sélectionnées ne changent
pas. C'est le mode documenté dans le
[code officiel Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS/blob/main/qwen_tts/inference/qwen3_tts_model.py).
L'objectif est de tester la contamination possible par la référence française,
pas de prétendre que cette cause ou la fidélité du nouveau mode sont déjà validées.
La ressemblance doit être comparée à l'écoute. Les réglages de synthèse FR/EN restent
ceux de R5-R1 ; les anciens profils et leurs empreintes sont inchangés.

En japonais, chaque réplique du dialogue est contrôlée, même si elle contient moins
de quatre caractères ou tient dans sa fenêtre. Le CER normalise les formes Unicode
et katakana/hiragana, sans deviner les lectures des kanji. Les textes d'au plus huit
caractères normalisés peuvent être retenus avec avertissement après comparaison des
trois tentatives si l'énergie vocale est présente, sans expansion excessive du texte
reconnu et avec une durée non confirmée au plus égale à `max(1.2, 0.25 × caractères + 0.5)`
secondes. Cette borne expérimentale ne remplace pas l'écoute. Elle ne limite **pas**
la fin souple d'un dialogue correctement reconnu. Les échantillons de profils
restent soumis à l'écoute/validation manuelle ; le contrôle ci-dessus concerne les
répliques synthétisées de l'extrait assemblé et du rendu complet.
Les erreurs distinguent un dialogue non conforme d'un dépassement de la fin vidéo.

Avant tout nouveau rendu complet, arrêter le worker du clone pour éviter deux calculs
GPU simultanés, copier `backend/scripts/ai-dubbing` et `backend/services/aiDubbing`
(y compris `commandRunner.js`), puis lancer depuis `backend` dans PowerShell :

```powershell
node scripts/ai-dubbing/compareJapanese.mjs --failure "C:\chemin\input-japanese-XXXXXX" --reference "C:\chemin\input-japanese-XXXXXX\reference.wav"
```

Le dossier portable est préparé sur la machine détenant la référence avec la même
commande et `--prepare-only`, en indiquant le dossier `failure-UUID` et le WAV
**source** du profil, pas son échantillon synthétique. `--check-only` vérifie seulement
la cohérence/empreinte des entrées, sans charger de modèle ni écrire de résultat.
Le lancement GPU exige également le même modèle et sa même révision que le diagnostic.

La comparaison produit deux variantes de trois tentatives chacune, avec les mêmes
graines appariées (graine du dernier échec + indice), textes, WAV de référence et
réglages d'échantillonnage. Ce n'est pas une reproduction binaire garantie de l'ancien
job. Chaque variante tourne dans son propre processus supervisé : 600 s par synthèse,
20 min au maximum pour la variante entière, y compris le chargement et le contrôle.
Ctrl+C arrête l'arbre du processus ; une variante terminée reste disponible si la
suivante échoue. Aucun BandIt, Pyannote, Sortformer, accès DB, job, HLS ou publication.

Résultats privés dans `backend/var/ai-dubbing/diagnostics/comparisons/japanese-*` :
`summary.json`, puis `comparison.json`, diagnostics par tentative et WAV
`AI-diagnostic-attempt-*.wav` dans chaque variante. Le contrôle R5-R2 est rapporté
pour **les deux** variantes, sans valider automatiquement une piste. Les WAV sont
bruts, non accélérés et non marqués, réservés au diagnostic local ; ils ne doivent
pas être publiés comme voix authentiques. Ces comparaisons ne suivent pas la rotation
des échecs ni leur transfert automatique : conserver seulement celles utiles aux tests.

Après écoute concluante, sélectionner le nouvel identifiant dans les `.env` du
primary de test et du clone, redémarrer, puis **créer une nouvelle analyse** avec les
mêmes références manuelles. Changer `.env` ne convertit pas un job existant. Les profils
vocaux validés d'une autre version restent intacts ; pas de réattribution des voix dans
ce patch. Les `.env` actifs restent sur R5-R1 en attendant ce comparatif. Pas de nouveau
modèle, migration ou build frontend requis pour R5-R2.

### Doublage IA : arrêt de génération vérifiable (V5 R5-R3, expérimental)

`sami-dubbing-v5-japanese-bounded-r5-r3` conserve l'identité vocale japonaise de
R5-R2, les références manuelles, le texte, la répartition et les fins souples. Les
autres langues et les anciens profils conservent leurs réglages. Aucun nouveau
modèle ni migration. Ce profil ajoute uniquement pour Qwen/JP :

- Un budget `max_new_tokens = min(720, max(96, 4 × N + 48))`, où N est le nombre de
  caractères alphanumériques après normalisation Unicode NFKC. C'est une borne
  expérimentale généreuse, **pas** la durée de la fenêtre de sous-titre.
- Une vérification du dernier token de la séquence du talker : il doit correspondre
  au signal EOS du modèle. L'EOS forcé à la limite est désactivé pour ne pas confondre
  arrêt artificiel et fin naturelle. Sans EOS vérifiable, refus **avant décodage**,
  aucun WAV tronqué transmis au contrôle qualité ou à la publication.
- Une adaptation locale et temporaire des méthodes de l'instance Qwen, restaurées
  même après exception, sans modifier la bibliothèque installée. Le contrat
  `talker.generate → sequences → speech_tokenizer.decode` est vérifié ; une interface
  incompatible bloque explicitement (`AI_DUBBING_GENERATION_CONTRACT`). Voir le
  [modèle officiel Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS/blob/main/qwen_tts/core/models/modeling_qwen3_tts.py).
- En cas de fin absente (`AI_DUBBING_GENERATION_LIMIT`), utilisation des trois
  tentatives existantes de la réplique, sans recommencer le job automatiquement.
  Un échantillon de profil reste refusé immédiatement si sa génération est interrompue.
  Une sortie terminée naturellement passe ensuite le contrôle qualité habituel.
- `generation-attempt.json` conserve `internalStage` et `internalStages` : préparation
  de la référence, génération des tokens, retour avec présence/absence d'EOS,
  décodage audio et fin du décodage. Les tentatives rejetées sont consignées dans
  `quality-failure.json`. Les fichiers suivent le transfert privé des diagnostics.

Le superviseur externe (600 s pour une réplique) reste nécessaire : un budget de
tokens ne peut pas débloquer une opération CUDA figée. Il n'est pas augmenté.
Les tests locaux de contrat ne prouvent ni la compatibilité effective du paquet
Qwen du clone ni l'amélioration sonore sur la 3090 ; les deux restent à vérifier.

Le comparateur accepte maintenant les archives de timeout composées de `error.json`,
`generation-attempt.json` et `input-profile.json`. Il retrouve la réplique exacte par
texte, intervenant et horodatage ; aucune reconstruction approximative. Une absence
ou ambiguïté, un mauvais WAV ou des empreintes de profil incohérentes bloquent avant
chargement GPU. Il accepte aussi les anciens diagnostics R5-R1 et R5-R2.

Copier `backend/scripts/ai-dubbing` et `backend/services/aiDubbing` sur le clone, puis,
serveur clone arrêté, tester depuis `backend` (chemins à adapter au paquet privé) :

```powershell
node scripts/ai-dubbing/compareJapanese.mjs --failure ".\input-japanese-XXXXXX" --reference ".\input-japanese-XXXXXX\reference.wav" --variant bounded-identity
```

`bounded-identity` lance R5-R3 seule, trois tentatives, et évite de rejouer le timeout
R5-R2. `identity-ab` compare R5-R2/R5-R3 ; sans option, l'ancien comparatif R5-R1/R5-R2
est conservé. Chaque sortie refusée avant décodage est indiquée dans le rapport et
n'a pas de WAV. Aucun résultat n'est publié automatiquement. Refaire également le
test du passage à 231,56 s déjà jugé bon pour contrôler l'absence de régression.

Après écoute, sélectionner R5-R3 sur le primary de test et le clone et recréer une
analyse. Les versions actives ne sont pas modifiées par la préparation du test.
Ne pas relancer un ancien job en supposant que changer `.env` le convertit.

### Doublage IA : comparatif anglais isolé (base R5-R3)

Ce test diagnostique compare le prompt audio + texte français avec l'identité
vocale seule pour une réplique anglaise en échec. Il ne crée pas de profil de
production, ne modifie ni R5-R3, ni `.env`, ni les pistes ou jobs existants.
Le rapport distingue `basePipelineVersion`/`baseGenerationConfigHash` et
`diagnosticOverrides.promptPolicy` : le mode expérimental n'est pas une exécution
inchangée du profil de production.

Copier `backend/scripts/ai-dubbing` sur le clone à jour, arrêter son worker pendant
le test et lancer depuis `backend`, avec le paquet privé préparé :

```powershell
node scripts/ai-dubbing/compareEnglish.mjs --failure ".\input-english-XXXXXX" --reference ".\input-english-XXXXXX\reference.wav"
```

`--check-only` vérifie les fichiers, langue, version et empreinte de référence sans
GPU ; `--prepare-only` produit un paquet portable privé. La référence est le WAV
original de l'intervenant, pas un WAV `quality-attempt` synthétique rejeté.
Les trois anciens WAV rejetés sont aussi copiés dans le paquet lorsqu'ils sont
présents, uniquement pour l'écoute comparative, jamais comme références vocales.
Les deux modes produisent chacun trois tentatives avec les mêmes graines appariées
et paramètres d'échantillonnage, sans garantir la reproduction des anciens WAV.
Le modèle et sa révision doivent correspondre au diagnostic. La supervision reste
à 600 secondes par génération et 20 minutes par variante ; le budget de tokens
japonais n'est pas appliqué à l'anglais. Aucune connexion aux modèles distants.

Résultats privés sous `var/ai-dubbing/diagnostics/comparisons/english-XXXXXX` :
`summary.json`, puis `reference-text` et `speaker-identity`, chacun contenant
`comparison.json`, les WAV `AI-diagnostic-attempt-N.wav` bruts (sans accélération)
et les diagnostics individuels. Les scores ASR sont indicatifs, jamais une
publication ou validation automatique. Écouter exactitude du dialogue, absence
d'ajouts et fidélité de voix avant de retenir un nouveau profil. Les sorties
diagnostiques sont synthétiques, privées, et à nettoyer manuellement après le test.

### Doublage IA : identité vocale anglaise (V5 R5-R4, expérimental)

`sami-dubbing-v5-english-identity-r5-r4` ajoute le mode Qwen identité vocale seule
en anglais, sur les échantillons individuels, l'extrait et le rendu complet.
La référence audio sélectionnée reste identique ; son texte est conservé dans les
diagnostics mais n'est pas injecté dans le prompt anglais. Les anciens profils,
notamment R5-R3, restent immuables et disponibles.

Le français conserve le prompt audio + texte. Le japonais conserve l'identité
seule, le budget de tokens, la vérification de fin avant décodage et ses contrôles
qualité R5-R3. L'anglais ne reçoit ni le budget ni le contrôle linguistique japonais.
Les seuils CER, trois tentatives, départs fixes, fins souples, limites d'accélération,
références manuelles et répartition des intervenants ne changent pas. Un nouveau
profil a sa propre empreinte : ces garanties ne promettent pas des WAV identiques
bit à bit à ceux d'un ancien job.

Empreinte : `0086594bd5b648717f336f68e4acb52b05158873d32c96c4c0f499acec8084d7`.
Copier `backend/scripts/ai-dubbing`, `backend/services/aiDubbing` et, pour les
vérifications, `backend/tests` sur le clone. Avant de créer le nouveau job, choisir
sur le primary de test et le clone, puis redémarrer les deux :

```dotenv
SAMI_AI_DUBBING_PIPELINE_VERSION="sami-dubbing-v5-english-identity-r5-r4"
```

Aucune migration, reconstruction du frontend ou installation de modèle requise.
Créer une nouvelle analyse anglaise pour la vidéo 13, valider les nouveaux
échantillons puis le rendu complet. Changer `.env` ne convertit pas les jobs
existants. Garder les cinq pistes déjà validées ; le comparatif positif sur une
réplique ne vaut pas validation de toutes les voix ou du rendu complet R5-R4.

### Navigation de l'administration et bibliothèque des doublages

La sidebar partagée passe en mode Admin uniquement sur `/administration` pour les
grades 1 et 2. Elle conserve Accueil et Paramètres, remplace Aléatoires par le
catalogue des sections et masque les outils réservés au grade 1 pour les admins.
Les liens `?section=ai-dubbing`, `?section=content`, etc. sont directs et compatibles
avec précédent/suivant du navigateur. Les sections se montent à leur première
visite puis restent masquées sans perdre les saisies ; les suraccordéons externes
sont supprimés. Le catalogue commun est `frontend/src/constants/adminSections.js`.
Les autorisations serveur et le consentement IA restent obligatoires.

Dans Doublages audio IA, « En cours » conserve les actions, erreurs, refus et
validations en attente. « Terminés et validés » contient uniquement les jobs
`PUBLISHED`, regroupés par vidéo (ID décroissant), toutes versions conservées,
langues FR puis JP puis EN, versions les plus récentes d'abord dans chaque langue.
Les cartes sont repliées par défaut et la suppression reste confirmée explicitement.
La pagination serveur compte cinq vidéos par page, pas cinq pistes.
`GET /api/ai-dubbing/jobs?view=published&page=1` retourne `groups` et `pagination` ;
`view=ongoing` exclut les publiés et conserve une pagination de 40 jobs.
Sans `view`, le contrat historique de liste de tous les jobs reste disponible.
Aucune modification du pipeline de synthèse, aucune migration nécessaire.

### Provenance des pistes IA et suivi du rendu complet

Dans `VideoAudioTrack`, `DisclosureVersion` versionne la notice de transparence IA
(`2026-08-23-v1`), tandis que `PipelineVersion` identifie le profil de génération
effectivement utilisé. La version de la notice est aussi enregistrée avec le choix
de l'utilisateur ; changer cette notice peut donc demander une nouvelle réponse.
Changer de moteur seul ne doit pas modifier cette version ni réinitialiser les choix.

La migration `20260908090000_audio_track_pipeline_version` ajoute la colonne nullable
et remplit les anciennes pistes `AI_DUB` uniquement depuis un job relié et portant
le même `VideoID`. Les pistes sans preuve restent à `NULL` : ni leur label ni le
profil actif ne permettent de reconstituer leur historique. Les nouvelles publications
copient `AiDubbingJob.PipelineVersion`, jamais la configuration actuelle du serveur.
Avant déploiement, on peut prévisualiser les correspondances sans écriture :

```sql
SELECT t.VideoAudioTrackID, t.VideoID, t.DisclosureVersion,
       j.PipelineVersion AS PipelineVersionToSet
FROM VideoAudioTrack t
JOIN AiDubbingJob j ON j.AiDubbingJobID = t.AiDubbingJobID AND j.VideoID = t.VideoID
WHERE t.Origin = 'AI_DUB';
```

Appliquer cette migration sur le primary avant redémarrage (`npx prisma migrate deploy`)
et générer le client (`npx prisma generate --generator client`). Déployer également
les contrôleurs du primary, les scripts/services sur le clone et le build frontend.

Le suivi R5-R1 du rendu complet affiche désormais le numéro de réplique, le total,
la tentative et le temps de synthèse. Le contrôle vocal, l'ajustement temporel,
l'assemblage, le mixage et le filigrane final ont un état distinct avec temps écoulé.
Ce suivi est commun au français, à l'anglais et au japonais, sans modifier les
graines ni les critères qualité du profil. Les étapes observées hors synthèse
ne reçoivent pas de nouvelle limite de temps ; la limite globale reste inchangée.

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

### Sous-titres IA locaux expérimentaux

La fonctionnalité utilise une file indépendante de l’encodage vidéo. Une vidéo
est traitée de bout en bout par un seul worker ; le coordinateur choisit le
worker prêt ayant la priorité `SAMI_AI_SUBTITLE_PERFORMANCE_SCORE` la plus
élevée. Tant qu’il reste en ligne et opérationnel, ce worker traite seul la file
IA. Le suivant ne prend le relais que s’il devient indisponible. Si le worker
prioritaire termine un encodage distribué, la file IA attend qu’il soit libre.
Après une erreur moteur, le worker concerné sort temporairement du pool afin
qu'une machine de priorité inférieure puisse retenter la tâche.
La transcription source horodatée est conservée en base, ce qui permet de
produire ensuite d’autres langues sans réanalyser l’audio.
Dans l’administration, chaque bloc est repliable indépendamment. Les pistes IA
ne sont chargées qu’après une recherche et les différentes langues d’une même
vidéo sont regroupées dans un sélecteur. Elles peuvent être corrigées sans
toucher à leurs horaires, supprimées ou recréées en forçant une nouvelle
transcription tout en conservant l’ancienne piste jusqu’à la réussite. Le super
administrateur dispose aussi d’un éditeur intégré et défilable, basculable en
plein écran, avec lecture HLS, timeline zoomable, déplacement complet des cues
et poignées séparées pour leurs heures de début et de fin.

Sur chaque installation, préparez une seule fois les dépendances et les modèles :

```bash
cd backend
npm run setup:ai
npm run setup:ai:check
```

`npm run start` contrôle ensuite l’installation, publie le heartbeat IA et
démarre automatiquement le coordinateur sur le primary ou le worker sur un
clone. Il ne retélécharge jamais les modèles. Configuration minimale commune :

```dotenv
SAMI_AI_SUBTITLES_ENABLED="true"
SAMI_AI_SUBTITLE_PIPELINE_VERSION="sami-ai-subtitles-v1"
SAMI_AI_SUBTITLE_MODEL="large-v3"
SAMI_AI_SUBTITLE_ENGINE="auto"
SAMI_AI_SUBTITLE_PERFORMANCE_SCORE="100"
```

Les scores recommandés pour le parc actuel sont 100 pour la RTX 3090, 80 pour
la RTX 3070, 60 pour le MacBook 24 Go et 40 pour la RX 6700 XT. Le mode `auto`
sélectionne `faster-whisper`/CUDA lorsqu’un GPU NVIDIA est détecté,
`whisper.cpp`/Metal sur macOS et `whisper.cpp`/Vulkan sur Linux sans NVIDIA.
FFmpeg et Python 3 sont requis ; Git et CMake sont aussi nécessaires lorsque
`whisper.cpp` doit être compilé. Sous Linux/AMD, les en-têtes et le runtime
Vulkan doivent être installés. Sous NVIDIA, le pilote doit être compatible avec
CUDA 12. Sous Linux ou Windows avec NVIDIA, le setup installe cuBLAS CUDA 12,
cuDNN 9, CUDA Runtime et NVRTC dans le venv puis transmet automatiquement leurs
chemins à CTranslate2 sans modifier le `PATH` global. Sous Windows, il choisit
également la variante CUDA de PyTorch compatible avec la version maximale
annoncée par `nvidia-smi` (par exemple `cu130` pour un pilote annonçant CUDA
13.2), remplace automatiquement une éventuelle variante CPU et interrompt le
setup si CUDA reste indisponible. La commande
`npm run setup:ai:check` vérifie également que CUDA, cuBLAS, cuDNN ou Metal sont
réellement utilisables avant de déclarer le worker prêt. Sur Linux sans NVIDIA,
le setup installe automatiquement la variante CPU de PyTorch pour la traduction
et réserve le GPU AMD au moteur Whisper Vulkan ; `SAMI_AI_TORCH_INDEX_URL`
permet de remplacer explicitement l'index PyTorch si nécessaire.

Sur un Mac Apple Silicon où CMake est absent, installez-le une fois avant de
relancer le setup ; le venv et les modèles déjà présents seront réutilisés :

```bash
brew install cmake
cd backend
npm run setup:ai
```

Le modèle de traduction actuellement installé est
[`facebook/nllb-200-distilled-600M`](https://huggingface.co/facebook/nllb-200-distilled-600M),
distribué sous licence CC-BY-NC-4.0 et prévu ici uniquement pour une instance
privée non commerciale. Avant toute commercialisation de SAMI, la priorité est
de remplacer ou relicencier ce modèle, de réauditer les licences des moteurs et
poids utilisés, puis de mettre à jour les informations légales et les règles de
conservation. Cette version ne doit pas être présentée comme compatible avec un
usage commercial.

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

### Génériques proposés par les utilisateurs

La fiche de chaque vidéo permet de proposer plusieurs intervalles de générique en
`HH:MM:SS`, avec capture de la position actuelle du lecteur. Chaque utilisateur voit
ses propositions et les intervalles validés. Il peut modifier ou supprimer ses
propositions uniquement tant qu'elles sont en attente.

Les admins et superadmins examinent toutes les propositions depuis la fiche vidéo
ou **Administration → Validation des génériques** (listes paginées par statut).
Ils peuvent vérifier le passage dans le lecteur, corriger les bornes, valider,
refuser ou supprimer un intervalle depuis la fiche. Le serveur vérifie les droits,
la durée du média HLS local et l'absence de chevauchement entre intervalles validés.
Les décisions et corrections sont sérialisées par vidéo en transaction MySQL pour
éviter qu'une validation concurrente accepte des intervalles incompatibles.

Pendant un intervalle validé, **Passer le générique** amène la lecture à sa fin.
Pour une série, **Épisode suivant** apparaît dès le début du dernier intervalle
validé si ce début est strictement après 50 % de la vidéo, et reste visible jusqu'à
la fin. Si aucun générique validé ne commence après 50 %, le bouton apparaît par
défaut à 90 % de la vidéo. Il suit l'ordre existant des saisons/épisodes, traverse les saisons et
redémarre l'épisode suivant à zéro. Il reste masqué si l'épisode suivant est absent
ou inaccessible. Ces boutons font partie du lecteur personnalisé, y compris son
plein écran ; les interfaces vidéo natives du navigateur (PiP / plein écran natif
sur certains appareils) ne permettent pas d'afficher ces boutons HTML.

Avant de déployer cette fonctionnalité, exécuter depuis `backend` :

```sh
npx prisma migrate deploy
npx prisma generate --generator client
```

La migration `20260911220000_add_video_credit_segments` crée uniquement la table
`VideoCreditSegment` et ses relations. Les repères sont locaux à cette instance ;
ils ne sont pas inclus dans les transferts vidéo entre instances.
