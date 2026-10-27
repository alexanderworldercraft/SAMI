# SAMI — Audit de sécurité du 26 octobre 2026

**Premier passage, état de référence.** Révision : `125fad2cd819fb147ad97a801dbfc99188942fbb`. Dépôt propre avant audit ; seuls les fichiers du présent dossier sont ajoutés, non suivis par Git. Aucun fichier applicatif du checkout principal n’est modifié. Aucun patch, commit ou déploiement en production.

## Résultat et priorités

Les preuves locales établissent deux défauts importants : les sessions de comptes bloqués/supprimés restent utilisables, et la récupération de compte modifie le mot de passe avant toute preuve de possession de l’adresse email. Le parseur multipart installé est également concerné par des avis de déni de service, avec un chemin d’entrée public dans l’inscription. Le runtime Node local est antérieur à la publication de sécurité du 21 octobre. **Ces constats ne prouvent pas que les mêmes versions et configurations sont déployées sur le serveur distant.**

| Priorité | Identifiant stable | Niveau SAMI | Constat | État |
| --- | --- | --- | --- | --- |
| P1 | SAMI-AUTH-001 | Élevé | Blocage/suppression sans refus global des sessions ; reconnexion d’un compte supprimé | Reproduit localement, patch 01 |
| P1 | SAMI-AUTH-002 | Élevé | Réinitialisation du mot de passe sans validation de possession de l’email | Prouvé par chemin de code et doubles de test, confinement patch 03 |
| P1 | SAMI-DEP-001 | Élevé | Busboy 3.2.0 affecté par des dénis de service multipart | Version et chemin public établis ; pas de charge malveillante exécutée, patch 02 |
| P1 | SAMI-RUNTIME-001 | Élevé | Node local 24.11.1 antérieur aux correctifs du 21 octobre | Version locale confirmée, version distante inconnue |
| P2 | SAMI-AUTH-003 | Modéré | Absence de révocation des JWT après déconnexion/changement de mot de passe | Défaut de conception établi, correction complète à concevoir |
| P2 | SAMI-API-001 | Modéré | IP issues d’en-têtes non fiables utilisées pour les limites et les journaux | Reproduit localement, exposition dépend du proxy, patch 01 |
| P2 | SAMI-API-002 | Modéré | Abonnement Socket.IO sans authentification aux métadonnées de traitements | Absence de middleware établie, réception distante non testée, patch 01 |
| P2 | SAMI-BILLING-001 | Modéré | Attribution Premium simulée accessible à tout compte authentifié | Comportement du code établi ; impact commercial dépend de l’intention produit, patch 01 |
| P2 | SAMI-DEP-002 | Modéré | Fastify 5.7.1 concerné par des avis de contournement de validation | Version affectée ; exploitation de routes SAMI non démontrée, patch 02 |
| P2 | SAMI-AI-001 | Modéré | Paquets IA/Python installés couverts par plusieurs avis, migrations contraintes | Inventaire et correspondances OSV ; chemins vulnérables à qualifier |

Les niveaux SAMI ci-dessus représentent une appréciation du risque avec les préconditions observées. Aucun CVSS applicatif n’est inventé. Les scores des éditeurs, lorsqu’ils existent, sont indiqués séparément.

## Périmètre et méthode

Lecture ciblée de la fabrique serveur, des middlewares, contrôleurs utilisateurs, autorisations, médias protégés, transferts/workers signés, import vidéo et authentification extension/compagnon. Lecture des manifests, trois lockfiles npm, requirements et scripts IA. Les dépendances déclarées, résolues dans les lockfiles et installées sont distinguées dans [inventory.json](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/inventory.json). Les paquets de quatre environnements IA locaux sont relevés par lecture de leurs métadonnées, sans charger les modèles : [python-inventory.json](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/python-inventory.json).

Outils : Git, rg, Node 24.11.1, npm 11.6.2, Python système 3.9.6, FFmpeg/FFprobe 8.0.1, Vitest 2.1.9, curl. Trois `npm audit --package-lock-only --json --ignore-scripts` ont consulté le registre public, sans installation. La recherche Web et les API GitHub/OSV ont enrichi les avis prioritaires. OSV a été interrogé sur **23 couples paquet/version sélectionnés**, pas sur l’ensemble des dépendances Python. Le catalogue CISA KEV consulté est daté du 23 octobre ; aucun des 15 CVE prioritaires recherchés n’y figure. Cela ne démontre pas l’absence d’exploitation. Sources et dates : [advisories.md](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/advisories.md), [advisory-metadata.json](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/advisory-metadata.json), [python-advisory-details.json](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/python-advisory-details.json), [kev-check.json](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/kev-check.json).

Les premiers accès réseau confinés ont échoué en DNS. Les lectures publiques nécessaires ont ensuite réussi avec les permissions d’exécution adaptées. Aucun rejet d’approbation ni blocage réseau ne subsiste pour les contrôles annoncés. Aucun secret, cookie de session, contenu privé ou code applicatif n’a été envoyé aux services de veille ; seuls des noms/versions de paquets publics et identifiants d’avis ont servi aux requêtes.

## Observations distantes vérifiées

Quatre requêtes publiques de confirmation, le 26 octobre vers **09:01:39 Europe/Paris**, après deux premières lectures de la racine vers 08:56:40. Aucune requête d’exploitation, injection, fuzzing, bruteforce, connexion à un compte ou modification de données.

| Contrôle | Résultat observé |
| --- | --- |
| HTTPS / | 200, HTTP/2, certificat accepté par curl (`ssl_verify_result=0`) |
| HTTP / | 301 vers HTTPS sur le même domaine |
| GET /api/users/me sans identité | 401 |
| HEAD /documentation/ | 200, documentation publique |
| En-têtes sur / | HSTS 15552000 + includeSubDomains, nosniff, DENY, no-referrer, Permissions-Policy |
| CSP sur / | Absente de la réponse examinée : durcissement à préparer, pas preuve d’une XSS |
| Cookies publics | Aucun Set-Cookie reçu sur ces lectures ; les attributs du cookie de connexion ne sont pas vérifiés à distance |

Preuves : [production-checks.json](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/production-checks.json) et fichiers `*.headers.txt`. Le bandeau `nginx/1.24.0 (Ubuntu)` ne donne pas le niveau des correctifs de la distribution ; aucune CVE nginx n’est affirmée à partir de ce seul bandeau. Pas de relevé exhaustif des versions TLS/chiffres ni de configuration effective du reverse proxy.

## Constats détaillés

### SAMI-AUTH-001 — Comptes inactifs acceptés

**Élevé ; confiance élevée ; CVSS non calculé.** [backend/middlewares/authMiddleware.js:45](/Users/patricktarroz/Documents/pro/dev/sami/backend/middlewares/authMiddleware.js:45) vérifie la signature et l’expiration puis affecte `request.user` sans contrôler l’état courant du compte. [backend/services/authz.js:1](/Users/patricktarroz/Documents/pro/dev/sami/backend/services/authz.js:1) recharge le grade, mais pas l’état. Le chemin média [backend/services/protectedMediaService.js:109](/Users/patricktarroz/Documents/pro/dev/sami/backend/services/protectedMediaService.js:109) ne refuse pas non plus un utilisateur bloqué. À la connexion, [backend/controllers/userController.js:603](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/userController.js:603) refuse l’état bloqué mais accepte l’état supprimé. La suppression conserve le grade et utilise en outre un mot de passe de remplacement constant : [backend/controllers/userController.js:1298](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/userController.js:1298).

Scénario : un ancien administrateur conserve son cookie signé avant son blocage ; ses requêtes passent encore l’authentification puis `ensureAdmin`. Un compte supprimé dont le nouvel identifiant est connu peut aussi franchir la connexion avec le mot de passe de remplacement. Les jetons durent 4 h pour SuperAdmin, 8 h pour Admin, jusqu’à 30 jours pour un utilisateur. Aucune tentative sur un compte réel n’a été faite.

Patch 01 : refuser tout état différent d’ACTIVE à la connexion, à l’authentification générale, aux autorisations et à l’accès média ; valider l’identifiant ; limiter les JWT de session à HS256 ; générer un remplacement aléatoire à la suppression. Retrait de deux logs contenant l’objet utilisateur et son hash. Les tests couvrent états 2/3, administrateur inactif et média avec identité inactive. **Le patch ne résout pas la révocation générale des sessions d’un compte encore actif** (AUTH-003).

### SAMI-AUTH-002 — Récupération sans preuve de possession

**Élevé ; confiance élevée ; CVSS non calculé.** [backend/routes/userRoutes.js:32](/Users/patricktarroz/Documents/pro/dev/sami/backend/routes/userRoutes.js:32) est public. Un couple surnom/email suffit à déclencher [backend/controllers/userController.js:1435](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/userController.js:1435). Le hash est remplacé avant l’envoi du message et avant toute confirmation de l’utilisateur. Une erreur SMTP laisse donc le mot de passe déjà modifié. La génération utilise Math.random. En cas de SMTP défaillant et de NODE_ENV différent de production, le mot de passe généré est même renvoyé dans la réponse : [backend/controllers/userController.js:1472](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/userController.js:1472).

Scénario principal : une personne connaissant surnom et email peut bloquer la connexion du titulaire en demandant la récupération, sans lire sa boîte. La limite de cinq demandes par heure et IP réduit la fréquence sans fournir la preuve de possession ; elle est aussi concernée par API-001. Une prise de compte via le fallback de développement est **conditionnelle** à une mauvaise configuration et à un échec SMTP ; ces conditions ne sont pas confirmées sur le site distant. Le test [reset-baseline-evidence.txt](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/reset-baseline-evidence.txt) confirme l’ordre écriture du mot de passe puis envoi, exclusivement avec Prisma/SMTP simulés.

Patch 03 : **mesure de confinement facultative et temporaire**, renvoyer 503 avant toute mutation sur cette route. Impact : la récupération autonome devient indisponible. Ce patch n’est pas présenté comme un parcours de récupération terminé. Le remplacement définitif devra utiliser un jeton aléatoire à usage unique, stocké haché avec expiration, une réponse uniforme, la preuve par lien email avant changement et la révocation des sessions. Voir [PATCHES.md](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/PATCHES.md).

### SAMI-AUTH-003 — Révocation des sessions

**Modéré ; confiance élevée sur la conception ; CVSS non calculé.** [backend/controllers/userController.js:719](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/userController.js:719) efface le cookie du navigateur sans invalider sa copie côté serveur. La signature JWT ne référence ni session persistée ni version de mot de passe. Le changement/rétablissement du mot de passe ne fournit pas de moyen central d’invalider un JWT déjà copié.

Précondition : possession d’un jeton signé valide, par exemple après compromission du navigateur. Il reste utilisable jusqu’à son expiration, même après la récupération du compte. Aucune compromission réelle n’est observée. Réponse durable : sessions révocables ou version d’authentification en base, contrôlée partout, y compris jetons média et connexions Socket.IO ; revalidation à l’expiration et lors des changements d’état. Le patch 01 ne couvre que les comptes devenus inactifs. Aucun changement de schéma incomplet n’est livré.

### SAMI-API-001 — IP non fiable

**Modéré ; confiance élevée localement, exposition distante conditionnelle.** [backend/controllers/logController.js:52](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/logController.js:52) prend la première valeur X-Forwarded-For, puis X-Real-IP. [backend/middlewares/rateLimitMiddleware.js:12](/Users/patricktarroz/Documents/pro/dev/sami/backend/middlewares/rateLimitMiddleware.js:12) utilise ce résultat, et [backend/server/createServer.js:239](/Users/patricktarroz/Documents/pro/dev/sami/backend/server/createServer.js:239) active une confiance sans restriction quand le mode proxy est demandé.

Scénario : si le reverse proxy transmet ou ajoute à l’en-tête fourni par un client, celui-ci choisit la clé de limitation et pollue les journaux. Les deux tests locaux montrent le choix de l’IP forgée ; **aucun contournement de limite en production n’a été tenté**. Le verrou par surnom limite certains essais de connexion mais ne protège pas tous les endpoints. Patch 01 : employer `request.ip` et limiter le cas booléen au proxy loopback du mode domaine actuel. Une infrastructure avec d’autres proxies doit configurer explicitement leurs réseaux de confiance et vérifier la réécriture des en-têtes nginx. Les Maps de limitation sans éviction bornée et sans partage entre processus restent un sujet de durcissement distinct.

### SAMI-API-002 — Métadonnées des traitements par Socket.IO

**Modéré ; confiance élevée sur le code, exposition distante non vérifiée.** [backend/server/createServer.js:245](/Users/patricktarroz/Documents/pro/dev/sami/backend/server/createServer.js:245) ne pose aucun middleware d’identité. [backend/controllers/videoUploadController.js:81](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/videoUploadController.js:81) et d’autres émetteurs diffusent globalement des événements contenant titres/métadonnées de vidéos en cours d’import et certains messages d’erreur.

Scénario : un client direct pouvant joindre Socket.IO s’abonne pendant un import et observe ces informations, y compris du contenu pas encore publié. La politique CORS ne remplace pas une authentification pour un client WebSocket ou un client non navigateur. Aucune écoute de traitement réel n’a été réalisée. Patch 01 : authentifier la session et vérifier un rôle administrateur avant d’admettre la connexion. Le test contrôle l’enregistrement et le refus du middleware ; la connexion réelle depuis tous les navigateurs et une API sur domaine distinct restent à valider. L’expiration/révocation d’une socket déjà admise et un éventuel cloisonnement par propriétaire restent à compléter.

### SAMI-BILLING-001 — Attribution Premium simulée

**Modéré ; confiance élevée sur le comportement ; impact conditionnel au contrat produit.** [backend/controllers/userController.js:1823](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/userController.js:1823) signe lui-même un événement de paiement et appelle le traitement qui écrit PremiumEndDate. Aucun mode de simulation ou refus en production n’encadre ces routes. La signature du webhook ne protège pas la route checkout qui fabrique la signature pour le demandeur.

Scénario : un utilisateur authentifié choisit YEARLY et obtient les droits Premium sans paiement si cette version du code est déployée. Si Premium est volontairement gratuit/simulé, il s’agit d’une décision produit à confirmer et non d’une perte financière établie. Aucune requête de paiement n’a été envoyée au site. Patch 01 : simulation désactivée par défaut, impossible en NODE_ENV=production ; activation volontaire uniquement hors production avec SAMI_ENABLE_FAKE_PREMIUM=true. Ce changement est à examiner si le parcours de simulation est volontairement utilisé.

### SAMI-DEP-001 — Parseur multipart affecté

**Élevé ; confiance élevée pour version/chemin ; CVSS éditeur 7,5 pour les deux DoS.** Busboy résolu/installé : 3.2.0. Le plugin multipart 9.4.0 est enregistré et l’inscription publique appelle request.parts dans [backend/controllers/userController.js:403](/Users/patricktarroz/Documents/pro/dev/sami/backend/controllers/userController.js:403) avant validation des identifiants. Un acteur anonyme peut donc atteindre le parseur, sous réserve des limites du proxy.

[CVE-2026-19484 / GHSA-xjh9-v7x6-24jw](https://github.com/advisories/GHSA-xjh9-v7x6-24jw) concerne la consommation CPU avec certaines frontières multipart ; [CVE-2026-19481 / GHSA-x8mw-p69m-v3mx](https://github.com/advisories/GHSA-x8mw-p69m-v3mx) concerne des en-têtes de partie conduisant à une exception. Correctifs 3.2.1. L’avis [CVE-2026-74866 / GHSA-gxm5-99cw-xjw9](https://github.com/advisories/GHSA-gxm5-99cw-xjw9), CVSS 5,8, est corrigé en 3.2.2. Les dates exactes figurent dans l’annexe. Aucune charge causant un blocage n’a été exécutée, même localement. Le patch 02 résout Busboy 3.2.2 dans une copie du lockfile.

### SAMI-DEP-002 — Fastify et autres alertes npm

**Modéré pour l’exposition applicative établie ; plusieurs avis amont sont élevés.** Fastify résolu/installé : 5.7.1. Les avis [CVE-2026-25223](https://github.com/advisories/GHSA-jx2c-rxcm-jvmq) (corrigé 5.7.2), [CVE-2026-33806](https://github.com/advisories/GHSA-247c-9743-5963) (5.8.5) et [CVE-2026-76169](https://github.com/advisories/GHSA-p68q-wchp-6fh7) (5.12.2) correspondent à cette version. Ils supposent des configurations de validation ou de gestion des routes précises ; aucun accès protégé SAMI n’a été contourné pendant cet audit. Le patch 02 demande ^5.12.5 et verrouille la version disponible 5.12.7, couvrant les avis Fastify rapportés par npm au moment du contrôle.

Résultats npm bruts : backend **60 paquets signalés** (5 critiques, 37 élevés, 17 modérés, 1 faible), frontend **65** (3 critiques, 38 élevés, 14 modérés, 10 faibles), compagnon **0** dans cette consultation. Ces chiffres incluent les outils de compilation/tests et les chaînes transitives ; **ils ne signifient pas 125 failles de production**. Les 292 liens d’avis uniques du backlog n’ont pas tous fait l’objet d’une reproduction ou d’un enrichissement chronologique individuel.

- Next 13.5.11 est amené par @fastify/nextjs, déclaré mais jamais importé/enregistré dans le code examiné. Ses alertes critiques ne prouvent donc pas une RCE du serveur SAMI. Le patch 02 retire cette dépendance inutilisée, sans rétrogradation proposée par npm.
- Les deux versions @fastify/static (8.3.0 et 9.0.0 via Swagger UI) sont signalées. Les gardes globales de normalisation, le filtrage des uploads et les contrôles realpath limitent les scénarios examinés ; les tests de non-exposition existants passent. La correction complète de paquet requiert d’examiner la compatibilité de la majeure 10, non imposée ici. Voir [avis de traversée](https://github.com/advisories/GHSA-83w8-p2f5-377r).
- Les alertes Axios qui supposent l’adaptateur HTTP Node ne sont pas assimilées à des SSRF du serveur : Axios est ici une dépendance frontend. React Router est utilisé dans la SPA ; les fonctions serveur des avis doivent être qualifiées avant de les compter comme exposition SAMI.
- Vitest/Vite et react-scripts/webpack-dev-server concernent surtout les environnements de développement. Leur présence dans dependencies fausse l’assimilation « --omit=dev = surface du serveur ». Ne pas exposer leurs serveurs aux utilisateurs.
- Les avis Nodemailer impliquent notamment des options/message fields contrôlés par l’attaquant. Le service mail examiné construit une configuration SMTP définie et n’expose pas une API d’options brutes ; aucune injection SMTP SAMI n’est établie.

Après le patch 02, l’audit du **lockfile proposé** rapporte 55 paquets backend signalés (4 critiques, 34 élevés, 16 modérés, 1 faible) et aucune entrée Fastify/Busboy/Next/@fastify/nextjs. Ce résultat ne valide pas le runtime avec ces nouvelles dépendances. Backlog : [dependency-backlog.md](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/dependency-backlog.md) et JSON bruts.

### SAMI-RUNTIME-001 — Node local antérieur à une publication de sécurité

**Élevé selon l’éditeur ; version locale confirmée ; exposition distante inconnue.** Le binaire employé pour cet audit est Node 24.11.1. La [publication officielle du 21 octobre 2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) fournit notamment des correctifs DNS/TLS, Brotli et clients HTTP. La branche 24 est corrigée en 24.22.1. La vulnérabilité Brotli CVE-2026-111497 suppose la décompression de données contrôlées par un attaquant ; une telle exécution n’a pas été démontrée dans SAMI.

Faire relever la version des processus réels du principal, des workers et du compagnon, mettre à jour dans une branche supportée puis redémarrer les processus concernés et revalider les médias/échanges signés. Aucun runtime n’a été remplacé par cet audit. La version affichée par le terminal local n’est pas une preuve de version sur le serveur.

### SAMI-AI-001 — Dépendances Python et restrictions de migration

**Modéré ; version affectée établie, atteignabilité des fonctions non établie.** Transformers 4.57.3/4.57.6, PyTorch 2.6.0/2.8.0, urllib3 2.6.3/2.7.0, Requests 2.32.5 et setuptools 58.0.4/80.10.2 correspondent à des fiches OSV, détaillées et dédupliquées par alias dans l’annexe. Exemples : urllib3 CVE-2026-97687/97688/97689, correction 2.8.0 ; Transformers CVE-2026-4372/5241/9856 et CVE-2026-80047 ; nouveau signal setuptools GHSA-xmj3-9gf7-h52w publié le 23 octobre (scénario Windows d’installation de wheel, pas une attaque distante prouvée sur ce Mac).

Scénarios : modèle/checkpoint ou serveur HTTP tiers malveillant, fonctions de conversion/entraînement ou installation de paquet spécifique. Ils nécessitent des préconditions distinctes d’un simple upload audio/vidéo. La traduction utilise local_files_only=True, et aucune activation explicite trust_remote_code=True n’a été trouvée dans les scripts examinés. Ces protections ne garantissent pas l’intégrité de tous les checkpoints.

Les requirements imposent Transformers<5 et setuptools<81 alors que plusieurs fiches annoncent des corrections au-delà. Ne pas casser les pipelines IA par une montée globale forcée. Préparer des environnements isolés compatibles, figer versions et révisions des modèles, valider les contrats de sous-titrage/doublage, puis planifier leur déploiement. Le chemin du venv sous-titres indique Python 3.9 ; le Python système est 3.9.6. Cette branche est arrivée en fin de support selon le [guide officiel Python](https://devguide.python.org/versions/). Les versions exactes de chaque interpréteur de worker et leurs correctifs système restent à relever.

## Contrôles favorables et limites

- Les médias vidéo sont servis par des routes protégées ; les chemins normalisés et realpath sont vérifiés. Les artefacts/stagings privés et médias bruts ne sont pas exposés par les routes statiques examinées. Les tests associés passent.
- Les routes internes de workers vérifient signature, empreinte du corps et nonces ; les domaines de signature sont séparés. Les tests de signature/rejeu inclus passent. La configuration réelle des secrets et accès réseau des workers n’a pas été consultée.
- Les requêtes Prisma brutes repérées sont paramétrées ; les principaux lanceurs de traitements utilisent des arguments séparés et shell:false. Ce contrôle ciblé n’équivaut pas à une preuve exhaustive d’absence d’injection.
- L’extension utilise PKCE, redirection liée à l’ID Chromium, code court à usage unique et jetons opaques hachés/révocables ; son état utilisateur est déjà contrôlé. Le compagnon sépare les cookies/Authorization selon l’origine et son installateur construit allowed_origins avec l’ID fourni. Les autres variantes installées, manifests système et navigateurs Windows ne sont pas audités ici.
- FFmpeg/FFprobe local est en 8.0.1. Les pages de sécurité FFmpeg n’ont pas pu être récupérées intégralement par l’outil Web ; le niveau de correctifs des binaires distants reste à vérifier. Deux essais de manifests factices nommés MP4 ont été rejetés sans requête réseau. **Aucune SSRF FFprobe n’est donc déclarée comme reproduite.** La restriction des protocoles d’entrée et l’isolation système des traitements restent des pistes de durcissement. Preuve négative locale : [media-probe-local.json](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/media-probe-local.json).
- CSP absente, documentation publique, cartes de limitation mémoire non bornées et messages d’erreur techniques méritent un durcissement priorisé. Ces observations ne sont pas comptées comme XSS, accès sensible ou déni de service distant prouvés.
- Aucun accès authentifié au site, à la base de production, au système, au firewall, aux logs privés ou aux versions effectives MySQL/FFmpeg/Python/Node des serveurs. Aucune infrastructure privée ou variante d’extension n’est réputée auditée.
- Les contrôles de code sont ciblés et progressifs. Il reste des contrôleurs et des dépendances non qualifiés individuellement ; l’absence de constat pour eux n’est pas une attestation de sécurité.

## Patchs et validation

[PATCHES.md](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/PATCHES.md) décrit contenu, effets, application en préproduction et retour arrière.

1. [01-core-security.patch](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/01-core-security.patch) : états de comptes, média, autorisations, identité Socket.IO, confiance proxy, garde de simulation Premium et retrait des logs d’objets utilisateur.
2. [02-dependency-security.patch](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/02-dependency-security.patch) : Fastify ^5.12.5 résolu 5.12.7, Busboy 3.2.2, retrait de @fastify/nextjs et de ses dépendances inutilisées ; manifest et lockfile synchronisés.
3. [03-contain-password-reset.patch](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/03-contain-password-reset.patch) : suspension temporaire de la récupération publique avec test dédié ; décision d’exploitation à prendre avant application.

Sur la version originale, 11 des 12 nouveaux tests de sécurité échouent comme attendu ; le cas compte actif passe. Après application des patchs de code dans une copie temporaire sans .env et avec Prisma/SMTP simulés : **88 tests passent dans 9 fichiers**, dont les nouveaux tests et les suites médias, fabrique serveur, extension auth, signature et rejeu des transferts. [tests-before.txt](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/tests-before.txt), [tests-targeted.txt](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/tests-targeted.txt), [reset-baseline-evidence.txt](/Users/patricktarroz/Documents/pro/dev/sami/security-reports/2026-10-26/reset-baseline-evidence.txt).

Les tests de code utilisent les dépendances déjà installées ; **les nouvelles versions du lockfile ne sont pas installées ni testées à l’exécution**. L’audit npm du lockfile proposé et git apply --check réussissent pour leur périmètre ; les alertes restantes demeurent. Pas de build frontend : aucun code frontend n’est changé. Pas de validation MySQL/migration réelle : aucune migration livrée. Les durées/capacités et effets d’une requête DB supplémentaire par authentification restent à mesurer en préproduction.

## Suivi entre exécutions

Premier audit : tous les identifiants ci-dessus sont nouveaux dans ce suivi. Aucun constat ne peut être classé corrigé en production. Les tests verts de la copie proposée ne changent pas ce statut. Les prochaines exécutions devront comparer ces identifiants et la révision Git, recontrôler les versions déployées lorsqu’elles sont disponibles et distinguer correction locale, déploiement et validation distante. Aucun doublon de CVE ne doit être créé pour une simple chaîne transitive.
