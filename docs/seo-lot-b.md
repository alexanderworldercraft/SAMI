# SEO — lot B, version 8.7.2

## Périmètre

Après validation locale et publique du lot A en 8.7.1 : réduire les octets du
frontend et le chargement des affiches hors écran. Les règles d'indexation du lot
A, l'authentification, les médias protégés et les données métier sont conservés.

## Livraison des ressources

`npm run build` exécute automatiquement `postbuild`, qui crée des fichiers `.br`
et `.gz` à côté des JS/CSS sous `frontend/build/static`. Le script utilise
uniquement les modules Node existants ; aucun service distant ou nouvelle
dépendance n'est nécessaire. Il conserve les originaux, ignore les liens
symboliques et les fichiers non concernés, puis écrit les variantes par renommage
atomique. Les fichiers trop petits ou les variantes sans gain ne sont pas publiés.

La prise en charge `preCompressed` de `@fastify/static` négocie la représentation
acceptée par le navigateur : Brotli, gzip, ou fichier original. Le type MIME reste
celui du JS/CSS. `Vary: Accept-Encoding` est conservé avec les autres valeurs de
Vary, y compris pour une réponse non compressée. HEAD, ETag et les réponses
conditionnelles continuent de fonctionner.

Le cache `public, max-age=31536000, immutable` s'applique uniquement aux réponses
réussies des fichiers `/static/` dont le nom contient une empreinte de contenu.
Le changement de contenu produit une nouvelle URL au build. Le HTML, les pages de
compte et de récupération, les API, les images à nom stable et les réponses 404 ne
reçoivent pas ce cache long. La politique des médias protégés n'est pas modifiée.

Les cartes de genres et de tendances de l'accueil utilisent le chargement différé
natif et le décodage asynchrone. La bannière principale reste chargée immédiatement
et prioritaire. Le navigateur décide de la distance de préchargement ; la présence
de `loading="lazy"` ne signifie pas qu'une affiche proche de l'écran ne sera jamais
chargée au démarrage. Les mises en page et textes alternatifs restent conservés.

## Déploiement et contrôle

1. Refaire le build avec les variables de l'environnement cible et
   `REACT_APP_VER=8.7.2`. Déployer **tout** `frontend/build/static`, fichiers
   originaux et variantes compris, avec le HTML de ce même build. Préférer un
   remplacement atomique du build et conserver les assets encore utilisés par
   des onglets ouverts selon la procédure de déploiement de l'instance.
2. Déployer également le backend de cette version puis le redémarrer. Si un proxy
   distribue directement `/static/`, lui configurer les mêmes négociations et
   en-têtes, ou conserver Fastify comme chemin de distribution. Aucun changement
   de proxy distant n'a été effectué par ce lot.
3. Sur les JS/CSS réellement référencés dans la page déployée, contrôler les
   réponses `Accept-Encoding: br`, `gzip` et `identity`, puis les tailles, le type
   MIME, `Content-Encoding`, `Vary` et `Cache-Control`. Vérifier la correspondance
   des contenus après décompression, HEAD et ETag/304.
4. Vérifier qu'une ressource sans hash, une page de compte, le HTML et une URL
   absente ne reçoivent pas le cache immutable. Refaire le contrôle SEO A pour
   vérifier les balises, le sitemap et les statuts.
5. Contrôler les affiches et la bannière sur mobile : visibilité, ordre des cartes,
   textes alternatifs et attributs de chargement. La compression et le cache ne
   remplacent pas une mesure réelle des Core Web Vitals.

Les tailles encodées mesurées localement sont des mesures de transport du build,
pas une garantie de temps de chargement ou de classement. Lighthouse et les
mesures terrain, lorsqu'ils sont disponibles, permettent de compléter le contrôle.
Le découpage du bundle et les variantes d'images restent à évaluer à partir de ces
mesures, sans refonte automatique dans ce lot.

La branche doit être testée et approuvée avant push/fusion ; l'utilisateur réalise
le déploiement. Le contrôle public du lot B est à refaire après cette mise à jour.

Références : [Fastify Static](https://github.com/fastify/fastify-static#precompressed),
[MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control),
[chargement différé natif](https://web.dev/articles/browser-level-image-lazy-loading).
