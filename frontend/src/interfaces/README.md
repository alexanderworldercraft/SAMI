# Interfaces SAMI

Cette étape isole l'interface classic existante, avec ses écrans, ses lecteurs,
sa navigation et ses classes responsive. Les interfaces tactile et remote ont
un point d'entrée distinct, mais affichent encore les composants classic.
Leur développement intervient après validation successive de chaque mode.

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
  tactile/index.js           entrée provisoire vers classic
  remote/index.js            entrée provisoire vers classic
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

Tactile et remote réutilisent actuellement les mêmes références de composants
que classic. Le changement de préférence entre ces trois entrées ne remonte
donc pas les pages ou le lecteur musique et conserve leur état. Il n'ajoute
aucun traitement ni appel API de consentement. Aucun écran spécifique tactile
ou remote n'est encore développé.

`data-interface-mode`, géré par `InterfacePreferenceProvider`, conserve le mode
demandé ou détecté. `data-interface-rendered`, géré par `InterfaceRenderer`,
indique l'interface effectivement affichée, actuellement `classic` dans tous
les cas. Le choix utilisateur n'est jamais remplacé par ce mode d'affichage.
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
