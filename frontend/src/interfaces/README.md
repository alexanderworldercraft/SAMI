# Interfaces SAMI

Classic conserve l'interface existante et son responsive. Tactile utilise sa
propre disposition et sa navigation, avec des adaptations des listes et des
lecteurs au toucher. Remote fournit une disposition TV et une navigation
à la télécommande.

## Organisation

```text
interfaces/
  InterfaceRenderer.js       sélection depuis la préférence par appareil
  registry.js                registre des trois modes et choix de secours
  shared/
    routeDefinitions.js      URL, protections et options de disposition
    AppRoutes.js             montage des pages et des protections communes
    MetaUpdater.js           titres et descriptions des routes
  classic/
    index.js                 contrat de l'interface classic
    layout/                  navigation, fond, footer, disposition
    pages/                   écrans utilisateur et pages publiques
    players/                 lecteurs vidéo et musique
    components/              composants de présentation classic
  tactile/
    index.js                 interface tactile
    layout/                  navigation fixe et menu tactile
    components/              recherche tactile
    pages/                   composition du lecteur tactile
    players/                 adaptation du moteur vidéo partagé
    tactile.css              styles limités au rendu tactile
  remote/
    index.js                 interface télécommande
    layout/                  disposition TV et barre latérale
    components/              gestion du focus et des commandes globales
    pages/                   composition du lecteur remote
    players/                 adaptation du moteur vidéo partagé
    spatialNavigation.js     sélection géométrique du focus
    remote.css               styles limités au rendu remote
```

Les services API, contextes, constantes et utilitaires restent communs dans
leurs dossiers existants. Les composants administratifs et réutilisables restent
dans `src/components`. Certains composants communs et administratifs utilisent
explicitement des composants classic ; leurs imports ont été ajustés sans
changer leur comportement. Les appels API et effets des pages déplacées sont
conservés, sans duplication de traitements ni modification des contrats serveur.

## Contrat d'une interface

Chaque entrée fournit `id`, `renderedMode`, `Shell`, `PersistentMusicPlayer` et
`pages`. Les clés de pages correspondent à `APP_ROUTES`. Une future interface
peut fournir ses propres pages, dispositions et lecteurs ; les protections
restent exclusivement définies par le routage commun. Ses lecteurs peuvent
réutiliser les services et utilitaires existants, et le contexte musique reste
au-dessus du sélecteur d'interface.

Remote et tactile réutilisent les pages
existantes avec sa propre disposition et remplace la composition de lecture
pour activer explicitement leurs contrôles. Les services et données ne
sont pas dupliqués. Le lecteur musique persistant conserve la même référence
entre les modes. Le changement effectif de disposition entre classic et
tactile peut remonter la page courante ; la playlist reste dans le contexte
musique commun.

`data-interface-mode`, géré par `InterfacePreferenceProvider`, conserve le mode
demandé ou détecté. `data-interface-rendered`, géré par `InterfaceRenderer`,
indique l'interface effectivement affichée : `tactile` pour tactile,
`remote` pour remote et `classic` pour classic et administration. Le choix utilisateur n'est jamais remplacé par ce mode d'affichage.
Un mode inconnu utilise classic comme secours.

## Administration

Les routes `/administration`, `/nouvelle-video` et `/nouvelle-musique` utilisent
toujours la disposition classic, leurs pages existantes et
`ProtectedAdminRoute`, indépendamment du mode demandé. Les composants
administratifs ne sont pas déplacés ni réorganisés. Leur présentation et les
liens d'administration de la navigation sont conservés.

## Validation de cette étape

- Conservation des 20 URL, des pages sans footer et des protections publiques,
  utilisateur et administrateur.
- Conservation du responsive classic et des modes de visibilité de navigation.
- Conservation des références de composants et de l'état du lecteur pendant
  la sélection des modes provisoires.
- Tests existants déplacés avec leurs composants, tests du registre, du routage,
  du sélecteur et de la disposition classic.
- Suite frontend complète, build de production et `git diff --check`.

Les tests automatisés ne remplacent pas la validation visuelle et la lecture
sur l'instance déployée. Aucune nouvelle migration de BDD pour cette étape ;
la migration de la première brique reste nécessaire si elle n'a pas encore
été appliquée.

## Adaptations tactiles

- Navigation fixe Accueil/Vidéos/Musique/Plus, sans sidebar ni marge réservée.
- Menu complet avec fermeture persistante pendant le défilement, recherche
  explicite, thèmes, liens utilisateur, voix selon consentement et outils admin
  selon grade. Les pages administratives restent classic.
- Zones interactives d'au moins 44 pixels, actions de navigation de 48 pixels,
  champs de 16 pixels et prise en compte des zones sûres de l'écran.
- Grilles de 2 à 6 colonnes selon la largeur, favoris visibles au toucher,
  titres maintenus et aperçu au survol désactivé dans ce mode.
- Contrôles vidéo révélés au toucher, sans révélation automatique au survol ;
  contrôles invisibles non interceptants et sous-titres au-dessus de leur
  hauteur réelle. Le moteur HLS, les sous-titres, pistes audio, génériques et
  commandes existantes restent partagés.
- Lecteur musique et bandeau de maintenance placés au-dessus de la navigation.
- Styles exclusivement sous `html[data-interface-rendered="tactile"]`.

L'aperçu visuel utilise des données fictives aux formats téléphone (390 pixels)
et tablette (834 pixels). La lecture réelle et les gestes natifs doivent être
validés sur un appareil tactile. Le tactile a été validé par l’utilisateur avant
le démarrage de remote.

## Interface remote V1

- Barre latérale et rubriques conservées, focus contrasté, cibles agrandies,
  grilles adaptées à la TV, favoris accessibles et absence de dépendance au survol.
- Navigation aux flèches selon la position des éléments, défilement du focus,
  confinement aux dialogues et menus ouverts, commandes cachées exclues du focus.
- OK/Entrée active les liens et boutons ; la recherche et les formulaires
  conservent les champs et le clavier natif de l’appareil.
- Dans le lecteur, OK sur la vidéo reprend/met en pause quand les commandes
  sont masquées, ou sélectionne la première commande quand elles sont affichées.
  Haut/bas affiche les commandes ; gauche/droite avance ou recule de 10 secondes
  quand elles sont masquées. Sur les commandes affichées, les flèches déplacent
  le focus ; les sliders et sélecteurs utilisent leurs commandes natives.
- Retour ferme les réglages ou l’aide, puis les commandes du lecteur ; un autre
  Retour revient à la page précédente. Les dialogues se ferment avant de quitter
  la page. Escape, BrowserBack, Backspace hors saisie et les touches Retour TV
  Tizen (10009) / webOS (461) sont prises en charge.
- Le lecteur musique persistant conserve son identité entre les trois modes.
  Les routes d’administration restent classic avec leurs protections existantes.
- Aucun changement d’API, de consentement, de préférences enregistrées ou de BDD.

L’aperçu TV utilise des données fictives. Le fonctionnement du clavier natif,
les touches propres à chaque modèle de TV et la lecture réelle doivent encore
être vérifiés sur l’appareil cible.
