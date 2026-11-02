# SEO — lot A, version 8.7.1

## Politique validée

Seules cinq pages sont proposées à l'indexation : `/`, `/updates`,
`/politique-confidentialite`, `/conditions-utilisation` et `/conformite-donnees`.
Les comptes, la récupération, les paramètres, les statistiques, l'administration
et les contenus protégés reçoivent `noindex, nofollow` dans le HTML initial et
l'en-tête `X-Robots-Tag`. Le contrôle d'accès reste assuré par l'authentification.
Les aperçus sociaux existants des lectures et personnes actives sont conservés.

Les définitions de métadonnées et l'autorisation d'indexation sont communes au
serveur et à React dans `frontend/src/seo/routePolicy.mjs`. Le sitemap XML n'inclut
aucun contenu de la base, aucun compte, aucun token et aucune date inventée.
`robots.txt` permet la lecture des directives `noindex` et annonce le sitemap.

Les adresses inconnues, les identifiants invalides et les contenus absents
répondent 404. Une panne du chargement des aperçus répond 503 avec `Retry-After`.
Ces erreurs présentent un message et un lien d'accueil sans lancer React ni les
requêtes des pages protégées. Les ressources statiques absentes restent des
erreurs 404, sans être remplacées par le HTML de l'application.

## Déploiement

Déployer les changements backend, le fichier partagé
`frontend/src/seo/routePolicy.mjs` et le nouveau build frontend **ensemble**, puis
redémarrer le backend. Le serveur réécrit le bloc de métadonnées du build selon
la route ; servir `frontend/build/index.html` directement depuis un proxy en
contournant Fastify ne bénéficie pas de cette politique. Son bloc par défaut est
volontairement hors index pour éviter l'indexation d'un shell générique.

Conserver la première origine HTTPS publique dans `PUBLIC_URL` du backend et le
même nom d'application dans `APP_NAME` et `REACT_APP_NAME`. Construire le frontend
avec les variables de l'environnement cible, dont `REACT_APP_VER=8.7.1` ; ne pas
publier les variables, adresses ou builds propres à une autre machine.

Ce lot ne nécessite aucune migration de base. Il ne modifie ni la compression,
ni le cache des assets, ni le chargement des images : ces changements constituent
le lot B.

## Validation avant et après déploiement

1. Exécuter les tests `pageSeoRoutes`, `socialPreviewRoute`, `socialPreviewService`
   et `serverFactory` côté backend ; `MetaUpdater`, `AppRoutes`, les métadonnées
   de vidéo/personne et `UpdatesPage` côté frontend ; réaliser un build et
   `git diff --check`.
2. Sur chaque page indexable, vérifier le HTML HTTP puis le DOM après JavaScript :
   une seule canonique HTTPS propre à la page, le même titre et la même
   description, des balises Open Graph/Twitter conservées, et `index, follow`.
   Répéter après navigation interne et retour arrière. Les paramètres de requête
   ne doivent pas apparaître dans la canonique.
3. Vérifier `noindex, nofollow` dès le HTTP sur connexion, récupération,
   statistiques, administration et catalogue protégé. Tester une lecture et une
   personne actives : aperçus sociaux conservés et accès anonymes toujours protégés.
4. Vérifier `/sitemap.xml` : 200 XML, exactement les cinq URL approuvées, sans
   comptes, vidéos, personnes ou statistiques. Vérifier son URL dans `robots.txt`.
5. Vérifier une URL inconnue, `/lecture/0`, `/personnes/0`, un contenu réellement
   absent et un asset absent : 404 ; page lisible pour les URL de navigation,
   aucune canonique d'accueil sur les erreurs. Simuler uniquement localement une
   panne du chargeur : 503 et aucun détail de connexion divulgué.
6. Vérifier `/updates/` : redirection permanente vers `/updates`, query conservée ;
   `/index.html` redirige vers `/`. Les liens directs applicatifs valides,
   l'authentification et les médias protégés doivent conserver leur fonctionnement.
7. Refaire le contrôle à 390 pixels, confirmer la version 8.7.1 dans l'application
   et conserver les preuves datées dans `seo-reports/` sans les versionner.

L'utilisateur déploie après validation de la branche. Son message **« check »**
déclenche une nouvelle vérification du dépôt local et de
`https://sami.worldercraft.fr`. Corriger dans la branche dédiée si le lot A n'est
pas conforme. Le lot B attend la validation du lot A. Tout push ou fusion conserve
son étape de confirmation ; la validation des tests locaux ne prouve pas le
déploiement en production.

## Retour arrière

Revenir ensemble au backend et au build de la version précédente, avec les
variables de l'environnement cible. Aucun rollback de base de données n'est
requis. Une désindexation éventuelle est asynchrone : les outils Search Console
servent à constater l'état réel lorsque l'accès est disponible.
