# Récupération de compte et révocation des sessions

## Parcours

1. Depuis la connexion, demander un lien avec le surnom et l’email. La réponse HTTP 202 est identique pour les comptes connus, inconnus et inactifs. Le message ne contient pas de mot de passe.
2. L’email contient un lien de confirmation construit exclusivement à partir de `PUBLIC_URL` (première origine si plusieurs sont déclarées). Le jeton aléatoire de 256 bits figure dans le fragment de l’URL ; seul son SHA-256 est stocké en base. Il expire après quinze minutes et ne peut être consommé qu’une fois.
3. Ouvrir le lien ne déclenche pas de réinitialisation automatique : le titulaire doit cliquer sur « Confirmer la récupération ». Le fragment est retiré de l’adresse affichée.
4. Après confirmation atomique, un mot de passe temporaire cryptographique est affiché une seule fois, sans stockage navigateur ni envoi par email. Il expire après quinze minutes et n’autorise qu’une première connexion.
5. Cette connexion donne uniquement accès à l’état minimal de session, à la déconnexion et au changement obligatoire. La modale exige le nouveau mot de passe et sa confirmation ; ni Échap, ni un clic extérieur, ni un rafraîchissement ne donnent accès à l’application. La même restriction est contrôlée côté serveur.
6. Après validation, un nouveau sel et un nouveau hash bcrypt sont enregistrés. Le mot de passe temporaire et les anciennes sessions sont invalidés, puis une session ordinaire est créée. La politique existante (8–20 caractères, majuscule/minuscule/chiffre/caractère spécial) est conservée.

La session limitée dure au plus dix minutes, dans la limite de validité du mot de passe temporaire. En cas de perte de la page d’affichage ou d’expiration, demander un nouveau lien. Une nouvelle demande envoyée invalide les anciens liens non consommés.

## Quand les sessions sont-elles déconnectées ?

Conformément au comportement retenu, une demande correspondant à un compte actif invalide ses sessions dès que l’envoi SMTP a réussi et que l’activation de la demande est validée en base. Le mot de passe actuel demeure inchangé jusqu’à la confirmation du lien. Une panne SMTP ne modifie ni le mot de passe ni les sessions.

L’envoi est lancé après la réponse HTTP pour ne pas révéler l’existence d’un compte par le temps d’envoi SMTP. Ce travail reste local au processus : un arrêt avant son exécution peut perdre l’email ; il faudra alors refaire la demande. Aucun jeton brut n’est persisté pour constituer une file d’attente. Un échec est journalisé sans contenu du message ou secret.

`UserSession` et `AuthVersion` rendent les sessions web révocables en base. Les autorisations médias portent l’identifiant de leur session parente et sa version : les prochaines requêtes HLS cessent de fonctionner après révocation. La déconnexion ordinaire révoque seulement la session concernée. Récupération, changement de mot de passe et changement d’état invalident les autorisations antérieures ; les jetons/codes de l’extension sont aussi liés à la version du compte et révoqués.

Les sockets nécessitent un compte administrateur actif. Elles sont coupées immédiatement dans le processus recevant l’invalidation et revalidées au plus toutes les quinze secondes dans les autres processus. Elles expirent au plus tard avec la session. Un flux HTTP déjà autorisé et ouvert n’est pas interrompu rétroactivement.

## IP fiable et limites

Les limites utilisent **`request.ip` résolu par Fastify**, jamais directement X-Forwarded-For ou X-Real-IP. Le mode nom de domaine n’accorde sa confiance qu’au loopback par défaut. `SAMI_TRUSTED_PROXIES` permet une liste séparée par des virgules de réseaux/adresses de proxies réellement maîtrisés, si l’installation le nécessite. Ne pas y mettre une plage globale.

Pour un Nginx public directement devant le backend local, adapter ces lignes dans la location de proxy existante, en conservant ses directives HTTP/WebSocket :

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

Le backend doit rester inaccessible directement depuis Internet. Si un CDN ou un autre proxy intervient, configurer d’abord la confiance de Nginx avec les réseaux exacts de ce fournisseur ; `$remote_addr` doit représenter le client après cette validation. Le code local ne certifie pas la configuration Nginx déployée : contrôler les IP obtenues depuis l’extérieur et avec un en-tête forgé après déploiement.

Les compteurs de récupération sont persistés dans MySQL et partagés entre processus, avec incrément atomique :

- Demandes : cinq par heure et IP fiable ; trois par heure et surnom normalisé, plus trois par compte réel pour couvrir les alias de collation MySQL.
- Confirmations : trente par quinze minutes et IP.
- Changement obligatoire : quinze par quinze minutes et compte/IP.

Le plafond par compte conserve la réponse générique 202. La limite IP renvoie 429. Les compteurs ne contiennent que des hashes des clés. Les enregistrements expirés sont nettoyés. Les limites générales déjà présentes en mémoire restent propres à chaque processus ; leur stockage est désormais borné et les fenêtres expirées sont éliminées.

## Autres correctifs inclus

- Refus des comptes bloqués/supprimés dans les contrôles d’identité, d’autorisation et de média ; mot de passe de remplacement aléatoire à la suppression.
- Autorisation d’extension liée à l’identité authentifiée, sans possibilité de remplacer userId/authVersion par des champs du corps de requête.
- Fastify 5.12.7 dans le lockfile, Busboy 3.2.2 ; suppression du plugin Next.js inutilisé. Les autres alertes de dépendances du rapport initial ne sont pas réputées corrigées.
- Simulation Premium désactivée en production et par défaut. Activation possible hors production avec `SAMI_ENABLE_FAKE_PREMIUM=true`.
- Suppression du retour de mot de passe temporaire en mode développement et de logs contenant l’objet utilisateur/hash.

## Déploiement

Appliquer `backend/prisma/migrations/20261026120000_secure_password_recovery/migration.sql` avec le workflow habituel `prisma migrate deploy`, régénérer uniquement le client Prisma (`prisma generate --generator client`), installer les dépendances depuis le lockfile, reconstruire le frontend et redémarrer les processus concernés.

La migration ajoute des colonnes et trois tables ; elle ne modifie pas les mots de passe existants. **Les anciens JWT web sans session persistée ne sont plus acceptés : une reconnexion générale est nécessaire à la mise en service.** Déployer backend, migration et frontend ensemble. Vérifier SMTP et `PUBLIC_URL` ; HTTPS est exigé pour le lien en production. Aucun accès à la base ou au site de production n’a été utilisé pour appliquer ces changements.

La mise à jour des binaires Node/FFmpeg/Python et la qualification des autres alertes IA/Nodemailer/static demandent une intervention distincte sur les environnements concernés. Ce patch ne met pas ces runtimes système à jour. Pour Node, prévoir au minimum 24.22.1 sur la branche 24 LTS, selon la [publication de sécurité du 21 octobre 2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).

## Validation

Le test `backend/tests/passwordRecovery.integration.test.js` est désactivé par défaut pour éviter tout accès implicite à une base. Il refuse de s’exécuter si l’URL et le socket ne désignent pas une base `sami_security_test` sous `/private/tmp/sami-security-mysql-*/mysql.sock`. Il utilise des comptes factices et un SMTP simulé. Les tests couvrent parcours HTTP, confirmation et connexion concurrentes, rejeu/expiration, SMTP en panne, compte inactif, révocation web/médias/extension et Socket.IO.

La migration est appliquée sur un vrai MySQL jetable à partir du schéma précédent, puis comparée au schéma Prisma attendu. La suite backend standard utilise une URL de base factice ; les tests qui nécessitent MySQL sont exécutés séparément sur le socket jetable. Les tests frontend vérifient la modale obligatoire, les deux saisies, le refus d’Échap, les erreurs serveur, le rafraîchissement, les réponses périmées et la confirmation explicite du lien.

Références de conception : [OWASP — récupération de mot de passe](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Fastify — trustProxy](https://fastify.dev/docs/latest/Reference/Server/#trustproxy). La révocation dès la demande est un choix explicite de ce produit ; une personne connaissant surnom et email peut provoquer cette déconnexion, même sans lire la boîte. Les limites en réduisent l’abus sans supprimer cette conséquence.

### Résultats locaux du 26 octobre 2026

- Suite backend standard : **737 tests réussis**, 108 fichiers ; 19 cas MySQL désactivés dans cette commande.
- Intégration séparée sur MySQL jetable : **19 tests réussis**, avec les nouvelles versions Fastify et Busboy réellement installées.
- Frontend : **366 tests réussis** dans 75 fichiers ; test de version 8.7.0 et nouvelles interfaces recontrôlés après synchronisation.
- Migration appliquée depuis le schéma précédent sur MySQL jetable ; comparaison Prisma : aucun écart.
- Build frontend réalisé ; avertissements préexistants de Hooks/accessibilité, fonctions inutilisées et taille du bundle. Aucun avertissement supplémentaire dans les nouveaux composants de récupération.
- Aucune migration ou publication sur la production. La base SAMI existante n’a pas été modifiée par la validation.
