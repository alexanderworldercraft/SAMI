# Propositions de patch — examen avant application

Les trois patchs sont des propositions. Aucun n’a été appliqué au checkout principal ou à la production. Ils ciblent la révision `125fad2cd819fb147ad97a801dbfc99188942fbb`. Les fichiers du rapport restent non suivis par Git et ne doivent pas être publiés avec des preuves sensibles.

## 01 — États de comptes, autorisations et interfaces administratives

`01-core-security.patch` ajoute les refus de comptes inactifs dans l’authentification, l’autorisation administrative et les médias, refuse la connexion des comptes supprimés et remplace le mot de passe de suppression constant par une valeur aléatoire. Il retire deux logs d’objets utilisateurs. Il utilise HS256 explicitement pour les sessions, conformément aux jetons émis actuellement.

Il ajoute aussi l’authentification et le contrôle administrateur lors d’une connexion Socket.IO. Le client d’import même origine utilise déjà les cookies du navigateur. Une installation avec API sur autre origine doit vérifier l’envoi des credentials et la configuration CORS. Le patch ne révoque pas automatiquement une socket déjà connectée après changement de statut : prévoir cette évolution avec la gestion complète des sessions.

Pour les IP, le mode `trustProxy: true` devient une confiance limitée au loopback. Cela correspond au lancement actuel pour nom de domaine derrière le proxy local. Si un autre réseau/proxy/CDN intervient, fournir explicitement la liste des réseaux de confiance et vérifier la réécriture des en-têtes. Ne pas rétablir une confiance aveugle dans X-Forwarded-For.

Enfin, les routes Premium simulées sont désactivées par défaut et toujours en production. Hors production, elles nécessitent `SAMI_ENABLE_FAKE_PREMIUM=true`. Cette modification doit être examinée si la simulation est un choix produit voulu : le constat ne prouve pas une fraude de paiement existante.

Impact : une lecture de l’état du compte en base pour chaque authentification, notamment avec jeton Bearer ; coût à mesurer. Une indisponibilité de la base fait refuser la requête. Certains tests/outils qui forgeaient des utilisateurs sans EtatID devront renseigner l’état actif. Les sessions des utilisateurs actifs restent compatibles. Aucune migration SQL.

Le patch comprend `backend/tests/securityAudit20261026.test.js` : 12 cas, dont 11 échouent sur le code initial et tous passent sur le code proposé.

## 02 — Dépendances backend ciblées

`02-dependency-security.patch` synchronise le manifest et le lockfile :

- Fastify demandé en ^5.12.5, version résolue lors de l’audit : 5.12.7 ; reste dans la majeure 5.
- Override de @fastify/busboy à 3.2.2, pour les correctifs des avis multipart examinés.
- Retrait de @fastify/nextjs, qui n’est pas importé/enregistré dans le code inspecté, et de la chaîne Next.js inutilisée.

Le lockfile est généré par npm dans un dossier temporaire avec `--package-lock-only --ignore-scripts --no-audit`. Aucun paquet n’est installé et aucun script d’installation n’est exécuté. Un nouvel audit du lockfile confirme la disparition des alertes Fastify, Busboy, Next et @fastify/nextjs. Il reste 55 paquets backend signalés par npm, qui ne sont pas tous des surfaces distantes.

**Limite de validation : les tests de code ont utilisé les dépendances déjà installées. Ils ne certifient pas l’exécution sur Fastify 5.12.7 et Busboy 3.2.2.** Une installation propre et les tests/builds appropriés sont encore nécessaires en préproduction. Pas de montée majeure de static, Nodemailer, Vitest ou des bibliothèques IA imposée dans ce patch.

## 03 — Confinement temporaire de la récupération de compte

`03-contain-password-reset.patch` renvoie 503 sur `/api/users/reset-password` avant toute mutation de mot de passe ou tentative SMTP. Il ajoute un test d’injection de requête avec dépendances DB simulées.

**Impact fonctionnel explicite : récupération autonome des mots de passe indisponible jusqu’au remplacement sécurisé.** Ce patch doit rester une décision de confinement, pas la solution définitive. Il n’est pas nécessaire pour évaluer les autres patchs. Il ne change pas directement la fonction interne historique de récupération : toute future utilisation de cette fonction doit être supprimée ou remplacée avec le nouveau flux.

### Contrat attendu pour le remplacement définitif

1. Recevoir une demande et renvoyer une réponse uniforme, que le compte existe ou non. Limiter les demandes par IP fiable et par compte normalisé ; ne jamais verrouiller le mot de passe courant à ce stade.
2. Générer un jeton cryptographique aléatoire, stocker uniquement son hash avec utilisateur, expiration courte et date de consommation. Conserver les valeurs du mot de passe hors des logs/réponses/email.
3. Envoyer un lien de confirmation sur l’origine publique configurée, sans utiliser un Host fourni par le client. Gérer l’échec SMTP sans changer le mot de passe existant.
4. Après présentation d’un jeton valide et du nouveau mot de passe, consommer le jeton atomiquement et mettre à jour le hash avec un nouveau sel, vérifier l’état actif et la politique de mot de passe.
5. Invalider les sessions antérieures, les codes de récupération concurrents et définir le comportement des jetons média et des jetons d’extension. Cela demande une décision de schéma/session et une migration complète.
6. Tester compte inconnu, jeton expiré, réutilisation et courses concurrentes, SMTP en panne, compte bloqué/supprimé, absence de divulgation, et invalidation effective d’une session déjà copiée.

## Validation réalisée et restant à réaliser

- Préconditions : aucun `.env` copié ; JWT et URL MySQL factices, port local 9 ; Prisma et SMTP simulés.
- Avant : 11 tests de sécurité en échec attendu, 1 contrôle positif réussi.
- Après : 88 tests réussis dans 9 fichiers (13 nouveaux cas de sécurité/confinement et 75 tests existants ciblés).
- Preuve supplémentaire du défaut de récupération : 1 test indépendant réussi qui constate l’écriture du mot de passe avant l’envoi de l’email, sans base ou email réel.
- `git apply --check` des trois patchs et `git diff --check` réussis.
- Audit npm du lockfile proposé réalisé ; aucune installation/déploiement ni validation réelle MySQL, Windows, navigateurs ou workers distants.

Pour une revue en préproduction : appliquer d’abord les patchs dans une branche isolée depuis la révision indiquée, après `git apply --check`. Installer ensuite les dépendances depuis le lockfile proposé dans cet environnement de validation, régénérer uniquement le client Prisma si nécessaire, puis exécuter les tests ciblés et les contrôles d’intégration serveur/médias/imports. Tester les interfaces administratives et les connexions Socket.IO avec comptes actif, bloqué et supprimé. Mesurer l’effet de la nouvelle lecture de compte sur les requêtes médias. Le build frontend n’a pas été lancé par cet audit car aucun fichier frontend n’est modifié.

## Retour arrière

Aucune migration de données n’est livrée. Les patchs se retirent dans l’ordre inverse après vérification `git apply --reverse --check`, en conservant ensemble manifest et lockfile du patch 02 puis en réinstallant la version correspondante dans l’environnement concerné. Une inversion peut rouvrir les défauts documentés : en cas d’incompatibilité, maintenir un confinement d’accès et corriger en préproduction. Ne jamais considérer un retour arrière fonctionnel comme une correction de sécurité.

Les mises à jour Node, FFmpeg, Python et des environnements IA sont des opérations distinctes : relever d’abord les versions effectivement utilisées par chaque processus et conserver leur procédure de redémarrage/validation.
