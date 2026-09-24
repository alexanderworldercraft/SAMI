# Extension navigateur SAMI

Extension Chromium Manifest V3 destinée au téléchargement direct et à la préparation d'imports vidéo dans SAMI.

## Installation de développement

1. Copier `.env.example` vers `.env`, puis renseigner le nom et l'URL publique de l'instance.
2. Exécuter `npm run build` dans ce dossier.
3. Ouvrir `chrome://extensions`, activer le mode développeur puis charger le dossier `extension/dist`.

Le dossier `extension/` constitue la référence transférable. Le dossier `dist/` est régénéré localement et ne doit pas être versionné.

## Composant compagnon multiplateforme

Le compagnon nécessite Node.js 18+ et FFmpeg dans le `PATH`. Il ne dépend pas de `yt-dlp`.

1. Recharger l'extension générée et copier son identifiant depuis `chrome://extensions`.
2. Si nécessaire, copier `companion/config.example.json` vers `companion/config.json` pour indiquer le chemin de FFmpeg ou le dossier de téléchargement.
3. Depuis `extension/companion`, exécuter `node scripts/install.mjs ID_DE_EXTENSION`.
4. Redémarrer complètement Chrome, Edge ou Chromium.

L'installateur enregistre le manifeste Native Messaging dans les emplacements utilisateur de Chrome, Chromium, Edge et Brave sous Windows, Linux et macOS. Sous Windows, il compile un petit lanceur natif avec .NET Framework 4.x ; `node.exe` doit rester disponible dans le `PATH` de l'utilisateur. Sous macOS, il compile avec `/usr/bin/clang` un petit hôte natif qui transmet directement le protocole à Node.js.

Sous Linux, l'installateur génère un lanceur contenant le chemin absolu de l'exécutable Node utilisé pendant l'installation. Les lanceurs macOS et Linux évitent ainsi les différences de `PATH` entre le terminal et un navigateur lancé graphiquement.

## État de la V1

- popup prioritaire et bouton injecté sur YouTube, Senpai Stream et Anime-Sama ;
- connexion via la page SAMI, PKCE et jeton opaque révocable ;
- observation des requêtes média via `chrome.webRequest` ;
- téléchargement direct par Chromium et assemblage HLS/DASH par FFmpeg dans le compagnon ;
- formulaire dans la popup pour le titre, la description, la saison et les genres ;
- sélection recherchable des séries, saisons et genres existants dans SAMI ;
- affiche optionnelle depuis la page ou un fichier local, avec aperçu et choix explicite de ne rien envoyer ;
- choix entre l'encodage simple et l'encodage multi-serveur lorsque celui-ci est disponible pour le SuperAdmin ;
- import multipart vers SAMI avec le jeton révocable, puis pipeline vidéo existant.

Téléchargez et importez uniquement les contenus pour lesquels vous disposez des droits nécessaires.
