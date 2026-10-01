# Extension navigateur SAMI — 0.1.4

Ce dossier `extension_2/extension` contient la version en cours de correction.
Le dossier historique `extension` à la racine du dépôt n’est pas modifié.

## Installation / mise à jour (Mac, Windows, Linux)

Prérequis : **Node.js 22+**, **FFmpeg** et **ffprobe**. Pour compiler le lanceur :
outils de ligne de commande Apple (`clang`) sur Mac ; .NET Framework 4.x
(`csc.exe`, normalement fourni par Windows) sous Windows.

Dans ce dossier, conserver votre `.env` existant ; pour une nouvelle instance,
copier `.env.example` en `.env` et adapter le nom et l’URL publique :

```dotenv
EXTENSION_APP_NAME="SAMIHUB"
EXTENSION_API_BASE_URL="https://mon-instance.example/samihub"
EXTENSION_VERSION="0.1.4"
EXTENSION_COMPANION_HOST="fr.samihub.media_companion"
```

Le préfixe éventuel de l’application est conservé pour login, API et imports.
Aucun mot de passe ou jeton ne doit être placé dans ce fichier. Une variante
installée en parallèle doit avoir son propre nom de compagnon et son propre dossier.

```sh
npm run build
npm --prefix companion ci
```

Charger **le dossier `dist` de cette version**, ou recharger cette extension
dans la page des extensions Chrome/Brave/Edge. Copier son identifiant, puis :

```sh
npm --prefix companion run install-host -- VOTRE_ID_EXTENSION
npm --prefix companion run doctor
```

L’installateur remplace le lanceur de cette version et enregistre le chemin absolu
du Node utilisé, y compris sous Windows : il ne dépend plus du PATH du navigateur.
Le relais Windows force aussi l’envoi de chaque bloc binaire sans attendre la
fermeture de la connexion. Après mise à jour de ses sources, relancer
`install-host` est indispensable : un ancien `.exe` ne se corrige pas avec le build
de l’extension. `doctor` vérifie séparément Node puis le lanceur ; un échec de ce
second test ne dépend pas de l’identifiant Brave.
Il vérifie aussi FFmpeg. Si un ancien compagnon reste chargé, fermer complètement
le navigateur puis le rouvrir. Recharger ensuite la page vidéo pour renouveler
les URL signées et la capture réseau.

`companion/config.json` est propre à chaque PC. Le choix de FFmpeg cherche le
PATH et les emplacements usuels (Homebrew sur Mac, C:\\ffmpeg et WinGet sur Windows).
Un ancien chemin FFmpeg d’un autre OS est ignoré. Un dossier de téléchargement
d’un autre OS provoque un message explicite. Des réglages distincts sont possibles :

```json
{
  "ffmpegPath": "ffmpeg",
  "ffmpegPaths": {
    "darwin": "/opt/homebrew/bin/ffmpeg",
    "win32": "C:\\ffmpeg\\bin\\ffmpeg.exe"
  },
  "downloadDirectory": "",
  "downloadDirectories": {},
  "allowUnauthorizedTls": false
}
```

Par défaut, les fichiers locaux vont dans le dossier `Downloads` de l’utilisateur.
Ne pas activer `allowUnauthorizedTls` pour contourner une erreur de certificat :
corriger le certificat de l’instance.

## Utilisation

1. Lancer la lecture, avec le son activé.
2. Ouvrir la popup et cliquer sur **Actualiser les médias** si nécessaire.
3. Choisir le manifeste / la qualité. HLS et DASH sont prioritaires ; les fragments
   TS/M4S ne sont pas proposés comme des vidéos autonomes. Les vrais fichiers
   MP4/WebM, y compris à URL opaque, restent accessibles.
4. L’audio d’un HLS maître ou d’une même ressource YouTube est associé
   automatiquement. Pour d’autres pistes séparées, choisir manuellement
   l’audio de la même vidéo dans le sélecteur.
5. **Télécharger en local** : compagnon uniquement, sans connexion ni envoi SAMI.
   **Importer** : connexion SAMI obligatoire, assemblage dans un dossier temporaire,
   envoi multipart à l’instance configurée, puis nettoyage temporaire.
6. La popup peut être fermée : le service worker garde la connexion native.
   La rouvrir retrouve l’état ; **Annuler** interrompt les traitements locaux.
   Si un import a déjà commencé, vérifier SAMI avant de le relancer.

Séries, saisons et genres existants ; affiche page / personnelle / aucune ;
encodage simple ou multi-serveur conservent les règles d’autorisation du serveur.
Un import accepté n’est pas une promesse d’encodage terminé : suivre son état dans SAMI.

Les sorties locales sont des **MKV**, pour réunir sans réencodage les codecs
vidéo et audio des sources (H.264, VP9, AV1, AAC, Opus…). Un fichier `.part` n’est
renommé qu’après succès ; les fichiers incomplets sont supprimés en cas d’échec.

## Détection et limites explicites

La capture réseau et les collecteurs de lecteurs fonctionnent sur les pages
HTTP(S) et leurs iframes, **sans liste blanche de sites**. YouTube, Pornhub,
Senpai, Anime-Sama et Cloudflare sont des exemples, pas une liste de compatibilité.

Prise en charge du moteur :
- fichiers progressifs HTTP(S), redirections et requêtes Range ;
- HLS standard, variantes, audio séparé, clés AES-128 standard ;
- DASH à durée finie, SegmentTemplate et URL héritées ;
- pistes YouTube vidéo/audio directes ; dépaquetage UMP **à taille connue**
  par plages contrôlées, puis fusion sans yt-dlp.

Pas de garantie universelle : DRM/SAMPLE-AES, SABR nécessitant un état de session
ou des POST spécifiques, UMP compressé/chiffré, liens chiffrés sans URL exploitable,
DASH live, HLS sans fin annoncée et blocages serveur restent des refus explicites. Aucun contournement
de DRM ni fabrication de jeton de protection YouTube n’est effectué.
Une URL expirée, un VPN/proxy différent du navigateur ou un serveur exigeant une
empreinte TLS particulière peut encore être refusé : le code HTTP exact est affiché.

Les cookies/en-têtes sont capturés uniquement pour les requêtes média observées,
gardés en mémoire de session de l’extension et appliqués à leur origine.
Ils ne sont pas transmis à SAMI, ni recopiés automatiquement sur un autre CDN.
FFmpeg accède aux médias via un relais temporaire **127.0.0.1** à URL aléatoire.
Seule la popup peut demander au compagnon de télécharger/importer.

Le build Firefox est conservé à titre expérimental ; cette validation cible
Chromium (Chrome/Brave/Edge). L’authentification Firefox nécessite une vérification
spécifique de son redirect URI avec le backend.

## Tests et transfert vers un autre PC

```sh
npm test
npm --prefix companion test
npm run build
npm --prefix companion run doctor
```

Les tests compagnon créent uniquement des médias synthétiques de deux secondes :
FFmpeg + ffprobe vérifient réellement vidéo ET audio, HLS/CDN distinct, DASH,
UMP, URL signées, import simple/multi vers une fausse instance, erreurs et annulation.
Les tests HTTP nécessitent le droit d’écouter sur 127.0.0.1.

Validation effectuée sur Mac. Les branches de résolution de chemins Windows
sont testées automatiquement, **pas le lanceur Windows sur un Windows réel**.
Les plateformes vidéo réelles et l’import sur votre serveur doivent encore être
validés dans le navigateur après rechargement.

Pour transférer : copier ce dossier, **sans** `node_modules`, `config.json`,
logs, lanceurs compilés/générés ni `node-path.txt`. Conserver `.env` seulement si
l’instance cible reste la même. Sur chaque PC : `npm --prefix companion ci`,
build, chargement de `dist`, puis installation du compagnon avec l’ID local.
L’installateur n’ajoute qu’un ID Chromium par nom de compagnon : pour des variantes
côte à côte, utiliser des dossiers et noms de compagnon différents.

Dépendances spécifiques : [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)
pour les manifestes DASH et [googlevideo](https://github.com/LuanRT/googlevideo)
pour le conteneur UMP ; versions figées dans le lockfile, aucune dépendance yt-dlp.

Télécharger/importer uniquement les contenus pour lesquels vous disposez des droits nécessaires.
