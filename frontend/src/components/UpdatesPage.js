import React, { useEffect, useState } from "react";

const updates = [
  {
    version: "7.10.0",
    title: "Diagnostic et fiabilisation de l'encodage distribue",
    date: "9 aout 2026",
    sections: [
      {
        title: "Diagnostic complet depuis l'administration",
        items: [
          "Une nouvelle section reservee au super administrateur permet d'analyser les jobs d'encodage distribue directement depuis l'administration du primary.",
          "L'historique est charge par pages de vingt-cinq jobs afin de rester rapide meme lorsque de nombreux encodages et incidents sont conserves.",
          "Un job en incident et un job de comparaison sain peuvent etre selectionnes pour confronter leurs taches, tentatives, erreurs, avertissements et informations video.",
          "Le diagnostic JSON telechargeable rassemble la configuration utile, les workers, la retention et les deux jobs sans inclure les cookies, JWT, secrets de transfert ou autres donnees d'authentification.",
          "Les tentatives echouees, annulees ou expirees restent visibles dans le diagnostic meme lorsqu'un nouvel essai a ensuite permis de terminer le job.",
        ],
      },
      {
        title: "Durees video et audio controlees avant l'encodage",
        items: [
          "L'analyse initiale determine maintenant la duree de la video et de chaque piste audio avant de construire le plan d'encodage classique ou distribue.",
          "La lecture FFprobe accepte la duree du conteneur, celle du flux, le couple duration_ts et time_base ainsi que les tags DURATION afin de couvrir davantage de fichiers MKV et de pistes atypiques.",
          "Les durees mesurees sont conservees dans le plan et le diagnostic avec, pour chaque piste, la duree source et la quantite de silence eventuellement ajoutee.",
          "TaskHistory affiche un avertissement explicite lorsqu'une piste audio est plus courte que la video de plus de deux secondes.",
          "Une duree introuvable est egalement signalee sans masquer le reste du suivi du job.",
        ],
      },
      {
        title: "Pistes audio courtes completees avec du silence",
        items: [
          "Les pistes audio plus courtes sont maintenant prolongees avec du silence jusqu'a la duree exacte de la video au lieu de produire une rendition HLS incomplete.",
          "Le filtre FFmpeg apad et une duree de sortie bornee sont appliques aux renditions multi-audio du pipeline distribue.",
          "Le meme alignement est applique au pipeline classique lorsque l'audio est integre aux variantes video afin de conserver un comportement coherent entre les deux parcours.",
          "La verification semantique des artefacts utilise la meme detection robuste de duree pour eviter de refuser une sortie valide a cause d'une metadonnee de conteneur absente.",
          "Les tests FFmpeg reels couvrent le parcours classique, les variantes video seules et les renditions multi-audio completees.",
        ],
      },
      {
        title: "Erreurs explicites et identifiants audio courts",
        items: [
          "Les taches audio utilisent des identifiants techniques courts comme Audio 1 tandis que le libelle complet choisi par l'utilisateur reste conserve dans les specifications de la piste.",
          "Le backend controle la limite de trente-deux caracteres avant l'ecriture Prisma et refuse proprement un libelle technique invalide avant de creer un job partiel.",
          "Une ancienne erreur Prisma P2000 sur la colonne ProfileLabel est traduite en message exploitable avec un code d'erreur stable.",
          "La page Nouvelle video affiche les echecs de creation multi-server dans une notification persistante avec leur code, sans obliger a consulter les logs du backend.",
          "Les avertissements audio sont persistants dans le job et restent consultables apres un rechargement ou un redemarrage.",
        ],
      },
      {
        title: "Maintenance et retention allegees",
        items: [
          "L'administration expose les horizons de retention, le nombre de jobs et d'artefacts conserves ainsi que les elements devenus eligibles a la prochaine purge.",
          "Les artefacts detailles restent purges progressivement apres un jour et les jobs terminaux apres trente jours, par lots bornes et sans toucher aux travaux actifs ou reprenables.",
          "La maintenance de finalisation utilise maintenant une lecture Prisma minimale sans manifestes, tentatives, fichiers de segments ni tri SQL.",
          "L'ordre des taches et des tentatives est restitue cote application afin de conserver la presentation existante sans solliciter le filesort MySQL sur de gros JSON.",
          "Cette reduction evite l'erreur MySQL 1038 Out of sort memory sur les films longs avec plusieurs profils et pistes audio, puis permet leur reprise automatique au passage de maintenance suivant.",
        ],
      },
    ],
  },
  {
    version: "7.9.0",
    title: "Encodage video distribue experimental",
    date: "31 juillet 2026",
    sections: [
      {
        title: "Ajout multi-server reserve au super administrateur",
        items: [
          "La page Nouvelle video propose un second bouton Ajouter la vidéo via le multi server lorsque la fonctionnalite experimentale est active sur le serveur principal.",
          "Le bouton, son explication et le suivi associe sont totalement absents pour les utilisateurs qui ne sont pas super administrateurs.",
          "Une infobulle accessible explique que les resolutions sont reparties entre le primary et les clones disponibles.",
          "Le bouton est desactive avec un retour explicite lorsqu'aucun clone compatible n'a donne de signe de vie.",
          "L'import classique et son pipeline historique restent disponibles sans modification.",
        ],
      },
      {
        title: "Registre extensible et repartition dynamique",
        items: [
          "La page Fonctionnalites experimentales permet d'activer ou desactiver les nouveaux jobs et de gerer un registre extensible de clones sensibles a la casse.",
          "Chaque clone publie sa plateforme, sa version FFmpeg, ses codecs, son etat, son unique slot et sa progression au primary toutes les quinze secondes.",
          "Les clones les plus performants recoivent d'abord les resolutions les plus lourdes, puis le primary, moins puissant, prend en dernier la plus petite tache encore disponible.",
          "Le premier worker compatible qui termine reprend la resolution suivante sans attendre la fin des autres workers.",
          "Le primary reste normalement limite a 360p et ne depasse ce plafond qu'apres cinq minutes consecutives sans heartbeat ni progression d'un clone compatible.",
          "Un clone qui arrive pendant un traitement peut prendre la prochaine tache libre sans interrompre une resolution deja commencee.",
        ],
      },
      {
        title: "Encodage, assemblage et suivi persistant",
        items: [
          "Chaque resolution est encodee en HLS de quatre secondes avec libx264 et AAC logiciel, puis renvoyee et controlee sur le primary.",
          "Avec plusieurs pistes audio, les variantes video restent sans audio et les renditions AAC sont produites sur le primary avant la creation du master HLS.",
          "Les sous-titres, l'affiche, le master, les apercus et la publication finale restent sous la responsabilite du primary.",
          "TaskHistory affiche la progression globale, le worker attribue, la phase, les tentatives, les reprises et les erreurs de chaque resolution.",
          "Les jobs, taches, leases, tentatives et manifestes sont persistants afin de reprendre apres un redemarrage sans publier une video partielle.",
          "Des controles atomiques empechent une ancienne tentative ou un lease expire de remplacer un artefact plus recent.",
        ],
      },
      {
        title: "Transferts signes, cache et nettoyage",
        items: [
          "Les clones initient uniquement des connexions sortantes vers l'API publique du primary, ce qui permet leur utilisation derriere un LAN, un VPN ou une NAT.",
          "Les requetes utilisent le secret de transfert existant avec un domaine HMAC distinct SAMI-DISTRIBUTED-ENCODING-V1, des nonces persistants et une liste blanche exacte des instances.",
          "La source est telechargee avec reprise Range, taille et SHA-256, puis conservee dans un cache prive LRU plafonne a 50 Gio et epingle pendant le travail.",
          "Le cache est purge apres une reussite ou une annulation et conserve au maximum vingt-quatre heures les sources utiles a une reprise apres echec.",
          "Les artefacts sont recus dans un staging non public, verifies fichier par fichier puis promus avant la publication atomique de la video.",
        ],
      },
      {
        title: "Deploiement, securite et verification",
        items: [
          "Une migration ajoute le registre des workers, les jobs, taches, tentatives, artefacts, nonces persistants, le reglage desactive par defaut et les actions de journalisation.",
          "Le primary doit etre deploye et migre avant les clones ; les identifiants SAMI_INSTANCE_ID exacts sont ensuite enregistres avant d'activer l'experience.",
          "La desactivation bloque seulement les nouveaux imports : les jobs deja lances terminent leur encodage et leur publication.",
          "Les routes internes refusent les workers desactives, les signatures invalides, les rejeux, les chemins dangereux et les leases perimes.",
          "La maintenance recupere les leases expires, les artefacts valides, les publications interrompues et les ingestions abandonnees, puis reconcilie les journaux manquants.",
          "Une retention BDD configurable purge par lots les artefacts detailles apres un jour et les jobs termines avec leurs taches et tentatives apres trente jours.",
          "Le schema Prisma, le protocole HMAC, le scheduler, le pipeline FFmpeg, les runtimes, les APIs, l'interface et le build de production disposent de validations dediees.",
        ],
      },
    ],
  },
  {
    version: "7.8.0",
    title: "Export video securise entre instances",
    date: "30 juillet 2026",
    sections: [
      {
        title: "Nouvel export reserve au super administrateur",
        items: [
          "L'ancien drawer d'import de metadonnees est retire de la page Nouvelle video et remplace par un export complet depuis la page de lecture.",
          "Le bouton d'export apparait uniquement sur /lecture/:id pour un super administrateur actif confirme par la base de donnees.",
          "Le mot de passe du super administrateur est demande avant chaque autorisation sensible, verifie localement sur le clone et n'est jamais transmis au serveur principal.",
          "Un precontrole verifie la configuration du clone, la disponibilite du principal et la validite de la session avant d'afficher les choix de destination.",
          "Les tentatives de mot de passe sont limitees et les erreurs de configuration, d'autorisation ou de connexion sont affichees directement dans le drawer.",
        ],
      },
      {
        title: "Destination et correspondance des catalogues",
        items: [
          "Le meme code SAMI peut maintenant fonctionner comme clone ou comme principal grace aux variables SAMI_INSTANCE_ROLE et SAMI_INSTANCE_ID.",
          "L'adresse du principal est configurable avec SAMI_PRIMARY_BASE_URL et utilise https://sami.worldercraft.fr dans la configuration recommandee.",
          "Le clone charge les genres depuis la base principale et preselectionne ceux qui correspondent aux genres de la video source.",
          "Les genres introuvables sur le principal sont signales par un avertissement jaune sans bloquer l'export et sans creer automatiquement de nouveau genre.",
          "Le super administrateur choisit explicitement entre un film independant et un episode rattache a une serie et une saison deja presentes sur le principal.",
        ],
      },
      {
        title: "Transfert atomique et controle des fichiers",
        items: [
          "L'export copie le titre, le resume, le statut Premium, les genres, le HLS, l'affiche, les sous-titres et les pistes audio du stockage moderne uploads/video/VideoID.",
          "Les acteurs, realisateurs, sagas, favoris, progressions, historiques et anciennes dates ne sont pas transferes ; la date de creation correspond au nouvel import.",
          "Le principal reserve les donnees avec une video invisible dans l'etat bloque et recoit les fichiers dans un dossier temporaire non public.",
          "Chaque fichier est controle par sa taille et son empreinte SHA-256, puis les playlists et references HLS sont validees une seconde fois avant publication.",
          "Les chemins, extensions, liens symboliques et fichiers speciaux sont controles afin d'interdire les sorties du stockage video autorise.",
          "La video devient active uniquement apres le deplacement atomique des fichiers verifies ; les apercus sont ensuite regeneres sur le principal.",
          "La video et tous ses fichiers d'origine restent conserves sur le clone apres un export reussi.",
        ],
      },
      {
        title: "Progression, reprise et annulation",
        items: [
          "Les exports sont enregistres dans les nouveaux modeles VideoTransfer, VideoTransferFile et VideoTransferStep afin de survivre aux rechargements et redemarrages.",
          "Le drawer reprend la presentation de TaskHistory avec une progression globale, le detail des etapes, les fichiers, les octets transferes, les avertissements et le recu final.",
          "Un transfert interrompu peut etre repris sans recreer la video ni dupliquer les fichiers deja valides.",
          "La reprise reconcilie egalement les sessions dont la reponse finale a ete perdue apres une creation ou une activation reussie sur le principal.",
          "L'annulation interrompt les flux actifs, nettoie les fichiers temporaires et retire les donnees bloquees tant que la publication finale n'a pas commence.",
          "Une maintenance au demarrage puis periodique reprend les jobs recuperables, nettoie les sessions expirees et restaure les reservations bloquees.",
        ],
      },
      {
        title: "Securite et journalisation inter-serveurs",
        items: [
          "Les echanges internes utilisent une signature HMAC-SHA-256 avec un secret partage identique sur le principal et les clones autorises.",
          "La methode HTTP, le chemin, l'horodatage, le nonce, l'instance source et l'empreinte du corps sont signes avant toute lecture de la requete.",
          "Les signatures perimees, les rejeux de nonce, les redirections, les origines inattendues et les requetes non HTTPS en production sont refuses.",
          "Les videos bloquees restent invisibles dans les listes, recherches, favoris, statistiques, historiques, recommandations et relations de contenu.",
          "Les actions de debut d'export, debut d'import, creation en base, transfert en cours, fin, echec et annulation sont journalisees sur les deux serveurs.",
          "Une reconciliation persistante repare les journaux manquants apres un redemarrage ou une interruption entre deux ecritures.",
        ],
      },
      {
        title: "Base de donnees, deploiement et verification",
        items: [
          "Une migration ajoute les tables de transfert persistantes, leurs index et les nouvelles actions de journalisation sans supprimer les donnees existantes.",
          "Une migration corrective aligne le modele Log avec son schema Prisma historique en ajoutant VideoID, SeriesID, SaisonID, les metadonnees d'audit, les index et les cles etrangeres manquantes.",
          "Cette correction est conditionnelle afin de fonctionner sur un clone incomplet comme sur un principal deja synchronise par une ancienne modification manuelle ou un db push.",
          "Le fichier d'environnement d'exemple et le README documentent les roles, l'URL du principal, le secret partage, les delais, la concurrence, Nginx et l'ordre de deploiement.",
          "Cette version utilise un seul processus backend par instance afin de conserver des verrous de job et une protection anti-rejeu coherents.",
          "Le schema Prisma, les tests backend, les tests d'autorisation et de securite, les tests du drawer et le build frontend de production ont ete verifies.",
        ],
      },
    ],
  },
  {
    version: "7.7.0",
    title: "Message general, details et statistiques avancees",
    date: "29 juillet 2026",
    sections: [
      {
        title: "Expiration automatique du message general",
        items: [
          "L'activation du message general programme maintenant sa desactivation automatique sept jours plus tard par defaut.",
          "Un champ date et heure optionnel permet de choisir une echeance plus courte ou plus longue avant l'activation.",
          "Le serveur valide que l'echeance personnalisee est dans le futur et conserve la date dans le nouveau champ ExpiresAt.",
          "Une tache planifiee controle chaque minute les messages expires et les repasse automatiquement a l'etat inactif.",
          "La migration attribue egalement une echeance de sept jours aux messages deja actifs lors de la mise a jour.",
          "L'icone native du selecteur de date suit maintenant le theme clair ou sombre grace au color-scheme du champ.",
        ],
      },
      {
        title: "Modernisation des details films et series",
        items: [
          "Les anciens champs d'edition des titres, resumes et informations de contenu sont remplaces par des inputs harmonises avec l'interface SAMI.",
          "Les labels, bordures, fonds, ombres, focus et placeholders utilisent maintenant les memes couleurs sky et slate que le reste de l'application.",
          "Les boutons d'edition, de validation et d'annulation partagent des styles communs pour conserver une presentation coherente.",
          "Les formulaires restent lisibles en theme clair et sombre et leur disposition s'adapte aux petits ecrans.",
          "Les styles reutilisables sont centralises afin que les pages film et serie conservent exactement le meme comportement visuel.",
        ],
      },
      {
        title: "Nouveaux compteurs de statistiques",
        items: [
          "La card Statistiques affiche maintenant les series ajoutees, les musiques ajoutees et les videos regardees en plus des compteurs existants.",
          "Les vues correspondent aux premieres lectures video journalisees avec l'action video_first_play.",
          "Les six indicateurs comparent les trente derniers jours aux trente jours precedents avec leur variation en pourcentage.",
          "Un nouvel endpoint agrege les deux periodes en une seule requete frontend et remplace les nombreux appels calendrier effectues jour par jour.",
          "Les compteurs de films, episodes, series et musiques ignorent les contenus places dans l'etat supprime.",
        ],
      },
      {
        title: "Explorateur graphique",
        items: [
          "Ajout d'une section Evolution de la mediatheque avec les tabs Videos, Personne, Sagas, Vue et Musique.",
          "Les sous-tabs permettent d'afficher le general, les films, les episodes, les sagas, les univers, les vues de films, les vues d'episodes, les albums ou les musiques.",
          "Un groupe de boutons permet de basculer entre les periodes de sept jours, trente jours et l'historique complet.",
          "La courbe cumulative utilise des points quotidiens pour les periodes courtes et un regroupement mensuel pour la vue Tout.",
          "Le resume du graphique affiche le total, la moyenne par jour ou par mois et le pic d'activite de la periode.",
          "Le graphique reprend le style bleu nuit et cyan de l'application avec une grille discrete, une zone en degrade et des points consultables au survol ou au clavier.",
          "Les donnees deja consultees sont mises en cache cote client et des etats dedies couvrent le chargement, l'absence de donnees et les erreurs reseau.",
          "La section Statistiques utilise maintenant toute la largeur disponible afin de conserver une courbe lisible sur ordinateur et reste navigable horizontalement sur mobile.",
        ],
      },
      {
        title: "Donnees, tests et verification",
        items: [
          "La nouvelle API de serie temporelle couvre les videos, films, episodes, personnes, sagas, univers, vues, albums et musiques.",
          "Les vues de films et d'episodes sont distinguees grace au contexte de saison conserve dans les logs de premiere lecture.",
          "Ajout de tests backend pour les echeances du message general, les periodes statistiques, les filtres de vues et les courbes cumulatives.",
          "Ajout de tests frontend pour le formulaire du message general, les details modernises, les six compteurs et la navigation entre les tabs et periodes.",
          "Les routes Fastify, les tests backend, les tests frontend cibles et le build de production ont ete verifies.",
        ],
      },
    ],
  },
  {
    version: "7.6.0",
    title: "Pistes audio multiples experimentales",
    date: "26 juillet 2026",
    sections: [
      {
        title: "Fonctionnalite experimentale",
        items: [
          "Ajout du reglage multi_audio dans AppSetting, desactive par defaut et reserve aux prochains imports video.",
          "La page Fonctionnalites experimentales propose un nouveau bouton Pistes audio multiples avec une description explicite de son comportement non retroactif.",
          "Ajout des endpoints /api/app-settings/multi-audio pour lire et modifier l'etat global de la fonctionnalite.",
          "Les changements d'etat sont journalises avec la nouvelle action multi_audio_toggle.",
          "La migration initialise le reglage et l'action sans retraiter ni modifier les videos deja presentes.",
        ],
      },
      {
        title: "Import et conversion HLS",
        items: [
          "addVideo detecte maintenant toutes les pistes audio avec leurs vrais index FFprobe lorsque la fonctionnalite est active.",
          "DEFAULT_AUDIO_PREFERENCES continue de choisir la piste principale, tandis que les autres pistes sont conservees dans leur ordre d'origine.",
          "Chaque piste audio est convertie une seule fois en AAC et stockee dans sa propre playlist HLS.",
          "Les variantes de resolution deviennent des flux video seuls et referencent un groupe audio commun avec les balises EXT-X-MEDIA.",
          "La piste principale recoit DEFAULT=YES dans le manifest et reste automatiquement selectionnee au demarrage de la lecture.",
          "Les timestamps et les segments de quatre secondes sont alignes afin de conserver la synchronisation pendant les changements de piste.",
        ],
      },
      {
        title: "Donnees et compatibilite historique",
        items: [
          "Ajout du modele Prisma VideoAudioTrack avec le libelle, la langue, la playlist, l'ordre et l'indicateur de piste par defaut.",
          "Les pistes conservees sont enregistrees pendant la finalisation transactionnelle de la video puis exposees par l'API de detail.",
          "La suppression definitive d'une video supprime egalement ses relations de pistes audio et son dossier HLS complet.",
          "Les anciennes videos conservent leur manifest historique et ne recoivent aucune ligne VideoAudioTrack.",
          "Quand l'option est desactivee ou que la source ne contient qu'une piste, le pipeline historique reste utilise sans modification.",
          "Une video multi-audio deja importee reste lisible sur sa piste principale si la fonctionnalite est ensuite desactivee.",
        ],
      },
      {
        title: "Selection audio dans le lecteur",
        items: [
          "Le lecteur ecoute maintenant les evenements AUDIO_TRACKS_UPDATED et AUDIO_TRACK_SWITCHED de Hls.js.",
          "Un menu Audio accessible permet de voir la piste active et de passer instantanement a une autre langue.",
          "Le menu est affiche uniquement lorsque la fonctionnalite est active et que la video possede plusieurs pistes enregistrees.",
          "Un fallback utilise la liste audio native du navigateur lorsque la lecture HLS native est employee.",
          "Les controles de qualite, sous-titres, volume, progression, plein ecran et eclairage d'ambiance restent disponibles.",
        ],
      },
      {
        title: "Genres automatiques",
        items: [
          "Ajout du genre automatique MultiAudio pour les videos dont plusieurs pistes ont reellement ete converties et conservees.",
          "Le genre MultiAudio est cree automatiquement s'il n'existe pas encore, comme JP, FR, VO et VOSTFR.",
          "Une source possedant plusieurs pistes mais importee avec l'option desactivee ne recoit pas le genre MultiAudio.",
          "La piste principale continue de determiner les genres de langue existants selon DEFAULT_AUDIO_PREFERENCES.",
        ],
      },
      {
        title: "Tests et verification",
        items: [
          "Ajout de tests backend pour la conservation de toutes les pistes, la piste par defaut, le manifest HLS et le genre MultiAudio.",
          "Ajout de tests frontend pour la selection audio, les anciennes videos et le masquage du menu lorsque l'option est desactivee.",
          "Le nouveau pipeline a ete valide avec un fichier MKV synthetique contenant des pistes japonaise et francaise.",
          "Le pipeline historique a ete valide separement avec la fonctionnalite desactivee.",
          "Le schema Prisma, les tests backend, les tests du lecteur et le build frontend de production ont ete verifies.",
        ],
      },
    ],
  },
  {
    version: "7.5.0",
    title: "Preview Live et lecteur video personnalise",
    date: "25 juillet 2026",
    sections: [
      {
        title: "Fonctionnalite experimentale",
        items: [
          "Ajout du reglage preview_live dans AppSetting, independant du tooltip de previsualisation des affiches.",
          "La page Fonctionnalites experimentales distingue maintenant clairement le tooltip des affiches et Preview Live dans le lecteur.",
          "Ajout des endpoints /api/app-settings/preview-live pour lire et modifier l'etat global de la fonctionnalite.",
          "Les changements d'etat sont journalises avec la nouvelle action preview_live_toggle.",
          "Ajout d'une migration pour initialiser le reglage et l'action de log sur les bases existantes.",
        ],
      },
      {
        title: "Spritesheets et WebVTT",
        items: [
          "Ajout d'un service FFmpeg dedie qui extrait une vignette de la video toutes les quatre secondes.",
          "Les vignettes de 160 par 90 pixels sont regroupees dans des spritesheets de 10 colonnes par 5 lignes.",
          "Chaque spritesheet contient au maximum 50 images et couvre donc jusqu'a 200 secondes de video.",
          "Un fichier WebVTT associe chaque plage temporelle a sa vignette avec des coordonnees xywh.",
          "Les fichiers sont stockes dans uploads/video/VideoID/preview-live avec une publication atomique pour eviter les apercus incomplets.",
        ],
      },
      {
        title: "Videos nouvelles et existantes",
        items: [
          "Quand Preview Live est active, addVideo genere automatiquement les spritesheets apres la finalisation du HLS.",
          "Ajout de l'endpoint GET /api/videos/:id/preview-live pour recuperer l'URL du WebVTT.",
          "Pour une video existante sans apercu, le premier appel genere automatiquement les fichiers depuis sa playlist HLS.",
          "Les apercus deja presents sont reutilises et les demandes simultanees pour une meme video partagent la meme generation.",
          "La variante HLS 240p est privilegiee, avec un fallback sur la premiere variante disponible pour les petites videos.",
        ],
      },
      {
        title: "Lecteur video personnalise",
        items: [
          "Les controles natifs sont remplaces par une barre de lecture personnalisee integree au lecteur.",
          "La barre affiche la progression lue, la partie mise en memoire et permet de rechercher precisement dans la video.",
          "Le survol de la progression lit le WebVTT et affiche la bonne zone de la spritesheet avec son horodatage.",
          "Le bouton CC active ou desactive la piste courante et affiche au survol ou au focus un menu de selection quand plusieurs sous-titres sont disponibles.",
          "Les commandes de lecture, pause, volume, sourdine et plein ecran sont disponibles dans la nouvelle interface.",
          "La selection de qualite HLS et l'eclairage d'ambiance existants sont conserves, avec une presentation adaptee aux petits ecrans.",
        ],
      },
      {
        title: "Tests et verification",
        items: [
          "Ajout de tests backend pour la limite de 50 images par spritesheet et la couverture de la fin de la video.",
          "Ajout de tests frontend pour le parseur WebVTT et la presence des controles personnalises.",
          "La generation a ete validee de bout en bout avec une video HLS synthetique et une spritesheet partielle.",
          "Le schema Prisma, les tests backend, les tests frontend cibles et le build de production ont ete verifies.",
        ],
      },
    ],
  },
  {
    version: "7.4.0",
    title: "Refactorisation serveur et pipeline video",
    date: "22 juillet 2026",
    sections: [
      {
        title: "Architecture serveur",
        items: [
          "La configuration Fastify est maintenant centralisee dans une fabrique commune partagee par les deux modes de demarrage.",
          "Les points d'entree TLS direct et reverse proxy ne contiennent plus que leur configuration specifique.",
          "Les routes, CORS, Socket.IO, Swagger, les fichiers statiques, le multipart et les middlewares sont enregistres au meme endroit.",
          "Les certificats SSL sont recherches depuis un chemin stable relatif au backend, quel que soit le dossier depuis lequel le serveur est lance.",
          "Les taches planifiees et le ping periodique de la base sont arretes proprement pendant la fermeture du serveur.",
        ],
      },
      {
        title: "Feedback de demarrage",
        items: [
          "Le chargement des certificats SSL affiche maintenant son avancement et confirme leur disponibilite.",
          "Un bandeau de demarrage affiche le nom de l'application, l'URL publique, le host public et le port local.",
          "Le nom affiche peut etre personnalise avec la variable APP_NAME et utilise SAMI par defaut.",
          "Le serveur confirme explicitement son ecoute puis execute immediatement un vrai ping SQL vers la base de donnees.",
          "Le port, l'horaire de sauvegarde et les informations publiques sont valides ou normalises avant le demarrage.",
        ],
      },
      {
        title: "Organisation des controleurs video",
        items: [
          "Le controleur video principal est decoupe en modules dedies au calendrier, a la progression de lecture et a l'import video.",
          "Les exports historiques sont conserves afin de ne pas modifier les routes API existantes.",
          "Les dates du calendrier, les mois et plusieurs identifiants recus par l'API sont maintenant valides avant les requetes Prisma.",
          "Le detail d'une video ne charge plus les sous-titres deux fois et execute en parallele les lectures independantes des personnes et favoris.",
        ],
      },
      {
        title: "Import et conversion video",
        items: [
          "La fonction addVideo devient un orchestrateur plus court avec des services separes pour le multipart, FFmpeg et la persistance.",
          "Chaque import utilise un espace temporaire isole qui est nettoye apres une reussite, une erreur ou une requete dupliquee.",
          "Les metadonnees du fichier ne sont analysees qu'une fois et les vrais index des flux audio, video et sous-titres sont utilises par FFmpeg.",
          "Les profils HLS respectent maintenant le ratio reel de la source et prennent en charge les videos plus petites que 240p.",
          "La selection audio, les genres automatiques, les sous-titres et le feedback Socket.IO restent integres au traitement.",
        ],
      },
      {
        title: "Fiabilite et securite des imports",
        items: [
          "Les champs multipart, SaisonID et genres renvoient des erreurs claires lorsqu'ils sont invalides.",
          "Les fichiers multipart ignores sont correctement consommes afin d'eviter de bloquer la lecture de la requete.",
          "La video reste masquee jusqu'a la finalisation de ses fichiers et de ses relations en base de donnees.",
          "La finalisation Prisma est transactionnelle et supprime la ligne ainsi que les fichiers crees si une etape echoue.",
          "Les sources en erreur de conversion sont archivees hors du dossier public uploads et le client ne recoit plus de chemin disque sensible.",
        ],
      },
      {
        title: "Tests et verification",
        items: [
          "Ajout de tests pour la configuration serveur, le bandeau de demarrage, le calendrier et les helpers d'import video.",
          "Ajout de tests multipart pour verifier le stockage isole de la source et les evenements de progression.",
          "La creation Fastify est verifiee sans ouvrir de port reseau et les routes video sont controlees par injection HTTP.",
          "La conversion HLS a ete validee avec une video synthetique et le schema Prisma reste valide.",
        ],
      },
    ],
  },
  {
    version: "7.3.0",
    title: "Favoris et navigation par genre",
    date: "11 juillet 2026",
    sections: [
      {
        title: "Favoris",
        items: [
          "Ajout d'une table UserFavoriteContent pour relier les utilisateurs aux films et series mis en favoris.",
          "Ajout d'une etoile de favori sur les cards films et series, independante du lien de lecture.",
          "Ajout d'une etoile de favori sur les pages de lecture, au niveau de l'affiche du film ou de la serie.",
          "Ajout d'un onglet Favoris dans les parametres utilisateur pour retrouver rapidement les films et series favoris.",
          "Ajout d'une option Lister les favoris dans les options supplementaires de la page Videos.",
        ],
      },
      {
        title: "Administration des favoris",
        items: [
          "Les drawers administrateur et utilisateur affichent maintenant les favoris apres la section Contenu regarde.",
          "Les listes de favoris dans les drawers sont paginees par groupes de 6 contenus.",
          "Ajout d'une section Favoris des utilisateurs dans la page Administration.",
          "La section admin permet de rechercher un contenu favori et de trier du plus favori au moins favori, ou l'inverse.",
          "La section admin des favoris utilise une pagination de 6 contenus par page.",
        ],
      },
      {
        title: "Logs et API",
        items: [
          "Ajout des actions favorite_add et favorite_remove dans le seed pour journaliser les ajouts et retraits de favoris.",
          "Les toggles de favoris creent maintenant un log rattache au VideoID ou au SeriesID concerne.",
          "Ajout des endpoints utilisateurs et administrateurs pour recuperer, verifier, basculer et analyser les favoris.",
          "La page Videos peut filtrer cote backend uniquement les contenus favoris de l'utilisateur connecte.",
        ],
      },
      {
        title: "Genres cliquables",
        items: [
          "Les badges de genres sur les pages detail film et serie deviennent des liens.",
          "Un clic sur un badge de genre redirige vers la page Videos avec le filtre du genre actif.",
          "Le mode edition des genres conserve son comportement existant avec les checkboxes.",
        ],
      },
    ],
  },
  {
    version: "7.2.0",
    title: "Durcissement securite et stabilite streaming",
    date: "8 juillet 2026",
    sections: [
      {
        title: "Authentification et autorisations",
        items: [
          "Le token JWT est maintenant porte par un cookie HttpOnly securise au lieu du localStorage cote frontend.",
          "Le client API envoie les identifiants avec les requetes protegees et les routes privees verifient la session via /api/users/me.",
          "Le backend accepte le cookie d'authentification tout en gardant la compatibilite avec l'ancien header Bearer.",
          "Les creations de comptes n'acceptent plus de grade envoye par le frontend.",
          "Le backend assigne directement le grade Utilisateur pour l'inscription classique et le grade Admin pour l'inscription administrateur protegee.",
        ],
      },
      {
        title: "Administration",
        items: [
          "Les routes d'administration et d'edition utilisent maintenant les middlewares ensureAdmin ou ensureSuperAdmin.",
          "Les actions sensibles recuperent l'utilisateur connecte depuis request.user.userId au lieu de valeurs envoyees par le client.",
          "Les formulaires admin de series, saisons, personnes et genres passent par le client API authentifie.",
          "Les anciens controles frontend de grade ont ete retires des flux de creation de compte.",
          "La creation de comptes administrateur est isolee sur une route protegee par super administrateur.",
        ],
      },
      {
        title: "API et limites",
        items: [
          "Ajout d'un rate limit global sur les routes API avec exemption des preflight OPTIONS.",
          "Ajout de limites plus strictes sur les endpoints de connexion, inscription et reinitialisation de mot de passe.",
          "Les uploads video et audio conservent la limite de 50 Go necessaire a l'application.",
          "Les endpoints d'images sont limites a 50 Mo afin de reduire les abus multipart.",
          "Les erreurs de fichier trop volumineux renvoient maintenant une reponse 413 coherente.",
        ],
      },
      {
        title: "Paiement premium",
        items: [
          "L'ancien endpoint public de premium gratuit a ete retire.",
          "Ajout d'un module de paiement factice separe pour preparer l'integration future d'un vrai prestataire.",
          "Le checkout premium factice cree une session controlee par le backend.",
          "Le webhook factice valide le paiement simule avant d'activer le premium.",
          "Le flux premium gratuit n'est plus declenchable directement depuis une route publique non verifiee.",
        ],
      },
      {
        title: "Fichiers et chemins",
        items: [
          "Le dossier BDD est deplace de uploads/BDD vers backend/BDD.",
          "Les chemins de sauvegarde de base de donnees pointent maintenant vers le nouveau dossier backend/BDD.",
          "L'ancien chemin uploads/BDD est bloque cote statique pour eviter l'exposition directe des sauvegardes.",
          "Les noms de fichiers recus par upload sont normalises avec path.basename sur les routes sensibles.",
          "Les images de videos, series, personnes, sagas, profils et musiques reduisent le risque de traversal.",
        ],
      },
      {
        title: "Headers et streaming",
        items: [
          "Ajout de headers de securite globaux : nosniff, frame deny, no-referrer, permissions-policy et HSTS en HTTPS.",
          "La configuration CORS utilise une allowlist basee sur l'URL publique de l'application.",
          "Les origines Socket.IO suivent la meme logique que les routes HTTP.",
          "Les fichiers HLS et media exposent maintenant des types MIME explicites compatibles avec nosniff.",
          "Le lecteur video garde un fallback HLS natif et journalise les erreurs Hls.js pour faciliter le diagnostic.",
        ],
      },
      {
        title: "Series et lecture",
        items: [
          "Les requetes de selection series/saisons ne bouclent plus sur toutes les saisons de toutes les series.",
          "L'API des series renvoie les informations necessaires aux cards sans declencher de rafale de requetes cote frontend.",
          "Les cards de series conservent le lien vers le premier episode disponible de la premiere saison.",
          "Les champs attendus par les cards et les pages de lecture sont preserves dans la reponse /api/series.",
          "Le rate limit a ete ajuste pour absorber les rafraichissements legitimes de l'interface sans masquer les abus reels.",
        ],
      },
    ],
  },
  {
    version: "7.1.0",
    title: "Page Musique et lecteur audio persistant",
    date: "7 juillet 2026",
    sections: [
      {
        title: "Lecteur musique",
        items: [
          "Le lecteur musique devient une card flottante detachee du contenu de la page.",
          "Le mode reduit est maintenant compact tout en gardant les boutons precedent, lecture, suivant et deplier accessibles.",
          "Le lecteur est reduit par defaut quand aucune musique n'est en cours ou en pause.",
          "Le lecteur se deplie automatiquement au premier ajout de musique puis conserve son etat pendant les ajouts suivants.",
          "Le bouton Reduire est place au-dessus de la playlist pour rester cliquable quand la file est ouverte.",
        ],
      },
      {
        title: "Persistance de lecture",
        items: [
          "Ajout d'un contexte global MusicPlayer pour conserver la playlist et les reglages du lecteur entre les pages autorisees.",
          "La playlist, le volume, le mode de repetition, l'etat reduit/deplie et l'ouverture de la playlist suivent la navigation interne.",
          "Le lecteur suit les pages Musique, Videos, Nouvelle video, Nouvelle musique, Personnes, detail personne et Sagas.",
          "Le lecteur n'est pas affiche sur les autres pages et n'apparait pas hors page Musique quand la playlist est vide.",
          "Les liens internes principaux utilisent maintenant Link de React Router pour eviter les rechargements complets de l'application.",
        ],
      },
      {
        title: "Page Musique",
        items: [
          "Ajout d'une barre de recherche dynamique pour filtrer les musiques et les albums pendant la saisie.",
          "La recherche d'album utilise le titre de l'album et les titres des musiques qu'il contient.",
          "Ajout d'une pagination independante pour les musiques avec retour automatique en haut de la section concernee.",
          "Ajout d'une pagination independante pour les albums avec retour automatique en haut de la section concernee.",
          "Les cards d'albums ouvrent maintenant une modal listant les musiques de l'album avec ajout individuel ou ajout de tout l'album.",
        ],
      },
      {
        title: "Navigation interne",
        items: [
          "Les liens internes de la navigation principale passent de liens href a Link pour garder l'etat de l'application.",
          "Les cards personnes, videos, series, tendances, sections de genres, historiques, calendrier, footer et pages login/register utilisent aussi la navigation React Router.",
          "Les liens mailto et les chemins de fichiers restent en liens natifs quand ils ne correspondent pas a une route React.",
          "La navigation vers les pages de lecture conserve la route existante /lecture/:id.",
        ],
      },
      {
        title: "Affichage du temps",
        items: [
          "Le temps du lecteur affiche maintenant les heures quand la duree ou la progression depasse 60 minutes.",
          "Les durees plus courtes conservent le format minutes:secondes.",
        ],
      },
    ],
  },
  {
    version: "7.0.1",
    title: "Feedback detaille des traitements video",
    date: "30 juin 2026",
    sections: [
      {
        title: "Nouvelle video",
        items: [
          "La card de traitement affiche maintenant une ligne par video ajoutee au lieu de barres globales partagees.",
          "Chaque video garde son propre suivi de telechargement, d'analyse, de conversions par resolution et de validation finale.",
          "Les traitements simultanes ne se melangent plus grace a un identifiant de traitement dedie pour chaque ajout video.",
          "Les etapes terminees sont masquees par defaut pour garder la card lisible pendant les conversions longues.",
          "Un bouton accordeon par video permet d'afficher ou masquer les evenements deja termines.",
        ],
      },
      {
        title: "Informations de traitement",
        items: [
          "Chaque sous-card affiche le titre de la video, la piste audio detectee et les sous-titres extraits.",
          "Les episodes affichent aussi Saison.Numero et Series.Titre quand une saison est associee a la video.",
          "La progression est maintenant individuelle pour le telechargement et pour chaque resolution encodee.",
          "Les erreurs de conversion restent visibles meme quand les evenements termines sont masques.",
          "La validation finale confirme que la video a bien ete enregistree apres l'encodage et le deplacement des fichiers.",
        ],
      },
      {
        title: "Estimation du temps restant",
        items: [
          "Ajout d'une estimation du temps restant sur l'etape en cours a partir du temps ecoule et du pourcentage atteint.",
          "L'estimation se met a jour a chaque evenement de progression recu par socket.",
          "Les etapes a 0% ou deja terminees n'affichent pas d'estimation pour eviter les valeurs incoherentes.",
          "Les barres de progression affichent maintenant correctement les etapes qui demarrent a 0%.",
        ],
      },
      {
        title: "Backend et sockets",
        items: [
          "Les evenements socket progress de addVideo transportent maintenant processingId, status, video et resolution quand necessaire.",
          "Le backend envoie les informations audio, sous-titres, saison et serie apres l'analyse des metadonnees.",
          "Chaque resolution emet un evenement de fin ou d'erreur pour alimenter la validation individuelle cote frontend.",
          "Un evenement completed par video est emis a la fin du traitement pour cloturer proprement la ligne concernee.",
        ],
      },
    ],
  },
  {
    version: "7.0.0",
    title: "Branche Musique et lecteur audio",
    date: "28 juin 2026",
    sections: [
      {
        title: "Base de donnees musique",
        items: [
          "Ajout des tables Musique, MusiqueGenre, MusiqueGenreMusique, Album, AlbumMusique et MusiqueGenreAlbum.",
          "Les genres musicaux sont separes des genres films et series pour garder des catalogues independants.",
          "Les musiques peuvent etre reliees a plusieurs genres et plusieurs albums.",
          "Les albums peuvent etre relies a plusieurs genres musicaux et contenir plusieurs musiques.",
          "Les relations UtilisateurID permettent d'identifier l'utilisateur qui cree les musiques, albums et genres musicaux.",
        ],
      },
      {
        title: "Logs et historique",
        items: [
          "Ajout des actions musique_create, musique_update, musique_soft_delete, musique_restore et musique_delete.",
          "Ajout des actions album_create, album_update, album_soft_delete, album_restore et album_delete.",
          "Ajout des actions musique_genre_create, musique_genre_update et musique_genre_delete.",
          "Ajout de l'action musique_first_play pour journaliser l'ecoute d'une musique par utilisateur.",
          "La table Log possede maintenant MusiqueID et AlbumID pour rattacher proprement les evenements musique sans polluer les Meta.",
        ],
      },
      {
        title: "Stockage des fichiers",
        items: [
          "Les fichiers audio sont stockes dans uploads/musique/MusiqueID/musique.",
          "Les affiches de musiques sont stockees dans uploads/musique/MusiqueID/affiche.",
          "Les affiches d'albums sont stockees dans uploads/album/AlbumID/affiche.",
          "Les uploads audio sont traites en flux vers un fichier temporaire avant de rejoindre leur dossier final.",
          "La suppression definitive nettoie les dossiers physiques des musiques et albums concernes.",
        ],
      },
      {
        title: "Nouvelle musique",
        items: [
          "Ajout de la page Nouvelle musique avec les onglets Musique, Album et Genres.",
          "Le formulaire Musique impose maintenant un fichier audio et ne propose plus de chemin d'acces manuel.",
          "Les champs Genres musicaux, Albums et Musiques de l'album reprennent le style des selects de SAMI avec recherche integree.",
          "Les formulaires permettent d'ajouter une musique avec image, premium, genres et albums associes.",
          "Les formulaires permettent aussi de creer des albums avec image, genres et musiques associees.",
        ],
      },
      {
        title: "Administration",
        items: [
          "Ajout d'une section Gestion des contenus musicaux dans la page Administration.",
          "La section reprend le style de Gestion des contenus avec des tabs directs Musiques, Albums et Genres.",
          "Les administrateurs peuvent modifier les titres, les relations, le statut premium et placer musiques ou albums en corbeille.",
          "Les selects de gestion utilisent les dropdowns SAMI avec barre de recherche.",
          "Les corbeilles ajoutent les tabs Musiques et Albums pour restaurer ou supprimer definitivement les contenus musicaux.",
        ],
      },
      {
        title: "Page Musique",
        items: [
          "Ajout d'une page Musique accessible depuis la navigation.",
          "Le lecteur audio est maintenant un composant independant en haut de page et reste visible au scroll.",
          "Le lecteur possede une playlist retractable en footer avec ajout depuis une musique ou depuis un album complet.",
          "La lecture enchaine automatiquement les musiques de la playlist et retire le titre termine de la file.",
          "Ajout des controles precedent, suivant, repetition de toute la playlist et repetition du titre actuel.",
        ],
      },
    ],
  },
  {
    version: "6.14.0",
    title: "Tooltip experimental de previsualisation video",
    date: "28 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une section Fonctionnalites experimentales dans la page Administration.",
          "Ajout d'un toggle Tooltip de previsualisation video actif ou inactif pour toute l'application.",
          "Le toggle reprend le style des autres interrupteurs administrateur de SAMI.",
          "Le reglage est stocke en base pour rester commun a tous les utilisateurs.",
          "Le changement d'etat du toggle est journalise avec une nouvelle action dediee.",
        ],
      },
      {
        title: "Cards de contenus",
        items: [
          "Ajout d'un tooltip au survol des cards films et series pour afficher une previsualisation video.",
          "Le tooltip est rendu hors des sections avec une position fixe pour passer au-dessus des cards et des blocs Tendance.",
          "La position du tooltip s'adapte automatiquement au viewport pour s'afficher au-dessus ou au-dessous de la card.",
          "Le diaporama affiche les images de preview disponibles avec un compteur base sur la liste reelle renvoyee par l'API.",
          "Les cards personnes et sagas ne declenchent pas de preview video quand aucun contenu video cible n'est disponible.",
        ],
      },
      {
        title: "Generation des previews",
        items: [
          "Ajout de l'endpoint GET /api/videos/:id/preview-frames pour recuperer ou generer les images de previsualisation.",
          "Les images sont generees depuis les segments HLS 240p de la video.",
          "Quand l'option est active et qu'aucune preview n'existe, l'API tente de creer les images au premier survol.",
          "Lors de l'encodage d'une nouvelle video, les images de preview sont aussi generees automatiquement si l'option est active.",
          "Une erreur sur un segment n'interrompt pas toute la generation : les autres frames continuent d'etre creees.",
        ],
      },
      {
        title: "Stockage des fichiers",
        items: [
          "Le stockage canonique des previews est maintenant uploads/video/VideoID/preview/frame-01.jpg.",
          "Les dossiers preview sont crees automatiquement pour les videos qui n'ont pas encore cette structure.",
          "Les anciennes previews dans uploads/previews/VideoID restent lues en fallback pour ne pas casser l'existant.",
          "La suppression definitive d'une video nettoie aussi l'ancien dossier legacy de previews quand il existe.",
          "Le frontend utilise les URLs renvoyees par l'API pour eviter les compteurs incoherents et les chemins absents.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout de la table AppSetting pour stocker les reglages applicatifs experimentaux.",
          "Ajout des endpoints /api/app-settings/content-preview pour lire et modifier l'etat de la feature.",
          "Ajout de l'action content_preview_tooltip_toggle dans seed.js.",
          "Ajout d'une migration pour creer AppSetting et initialiser le reglage content_preview_tooltip.",
          "Ajout d'une migration pour creer l'action content_preview_tooltip_toggle sur les bases existantes.",
        ],
      },
    ],
  },
  {
    version: "6.13.1",
    title: "Controle des lumieres d'ambiance en lecture",
    date: "27 juin 2026",
    sections: [
      {
        title: "Page Lecture",
        items: [
          "Ajout d'un toggle Ambiance en haut a droite du lecteur video.",
          "Le toggle reprend le style du select de resolution avec affichage au survol du lecteur.",
          "Les lumieres d'ambiance sont activees par defaut pour conserver le comportement existant.",
          "Le choix actif ou inactif est conserve dans le localStorage de l'utilisateur.",
          "Quand l'utilisateur desactive l'ambiance, le fond repasse sur une couleur par defaut et ne se met plus a jour.",
        ],
      },
      {
        title: "Performance video",
        items: [
          "Le rafraichissement de la couleur d'ambiance est augmente pour suivre plus rapidement la video.",
          "Le calcul de couleur s'arrete automatiquement quand la video passe en plein ecran.",
          "Le calcul de couleur s'arrete aussi quand la video passe en picture in picture.",
          "Quand l'utilisateur revient au mode de lecture normal, l'ambiance reprend si le toggle est actif.",
          "Les intervalles de calcul sont nettoyes a la pause, a la fin de la video et au demontage du lecteur.",
        ],
      },
    ],
  },
  {
    version: "6.13.0",
    title: "Univers et regroupement des sagas",
    date: "22 juin 2026",
    sections: [
      {
        title: "Page Sagas",
        items: [
          "La page Sagas est maintenant organisee par Univers.",
          "Chaque univers affiche ses sagas dans une section dediee, avec une ligne par univers.",
          "Les sagas qui ne sont rattachees a aucun univers actif sont regroupees dans un Univers par defaut affiche en dernier.",
          "Un univers sans saga visible est masque automatiquement.",
          "La recherche peut maintenant retrouver une saga ou un univers par titre et resume.",
        ],
      },
      {
        title: "Recherche et pagination",
        items: [
          "La recherche de la page Sagas fonctionne directement pendant la saisie, sans bouton de validation.",
          "La recherche est appliquee cote backend avant affichage pour retrouver aussi les sagas qui ne sont pas visibles a l'ecran.",
          "Chaque univers possede sa propre pagination quand il contient plus de 8 sagas.",
          "Les univers avec 8 sagas ou moins restent affiches sans pagination.",
          "Changer la recherche ou le tri remet les paginations des univers a leur premiere page.",
        ],
      },
      {
        title: "Nouvelle video",
        items: [
          "Ajout d'un onglet Univers pour creer un nouvel univers.",
          "Ajout d'un onglet Sagas univers pour lier une saga a un univers avec un ordre personnalisable.",
          "Les selects Univers et Saga integrent une barre de recherche dans leur dropdown.",
          "Le select Saga de l'onglet Contenus saga integre aussi une barre de recherche.",
          "Les formulaires reprennent les styles existants de SAMI.",
        ],
      },
      {
        title: "Administration",
        items: [
          "Ajout d'une section Univers dans la page Administration.",
          "Les administrateurs peuvent modifier le titre et le resume d'un univers.",
          "Les sagas d'un univers peuvent etre retirees sans supprimer les sagas elles-memes.",
          "L'ordre des sagas dans un univers peut etre gere par champ numerique ou par drag and drop.",
          "Les selects administrateur Sagas et Univers utilisent maintenant une recherche integree au dropdown.",
        ],
      },
      {
        title: "Corbeille univers",
        items: [
          "La suppression administrateur place maintenant un univers en corbeille.",
          "Ajout d'une section Corbeille univers reservee au super administrateur.",
          "Le super administrateur peut restaurer un univers place en corbeille.",
          "La suppression definitive retire les liaisons avec les sagas et supprime l'univers.",
          "Les sagas liees a un univers ne sont jamais supprimees lors de la suppression de l'univers.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout des tables Universe et UniverseSaga pour stocker les univers et leurs sagas.",
          "Chaque relation UniverseSaga porte son propre ordre, independant pour chaque univers.",
          "Ajout des endpoints /api/universes pour lister, creer, modifier, lier, reordonner, restaurer et supprimer les univers.",
          "La liste publique des univers renvoie uniquement les univers actifs avec au moins une saga active visible.",
          "Les sagas sans univers actif sont ajoutees a un groupe par defaut genere par l'API sans etre stocke en base.",
        ],
      },
    ],
  },
  {
    version: "6.12.0",
    title: "Sagas de films et series",
    date: "22 juin 2026",
    sections: [
      {
        title: "Sagas",
        items: [
          "Ajout d'une nouvelle page Sagas accessible depuis la navigation.",
          "Une saga regroupe des films et des series entieres dans un ensemble commun.",
          "Les cards de sagas reprennent le style des contenus avec affiche, resume au survol et badge Premium.",
          "L'ouverture d'une saga affiche un modal avec la liste ordonnee de ses contenus.",
          "Un clic sur un film ouvre directement sa page de lecture, et un clic sur une serie ouvre son premier episode disponible.",
        ],
      },
      {
        title: "Page Lecture",
        items: [
          "Ajout d'une section Sagas sur la page de lecture quand le contenu appartient a au moins une saga.",
          "La section reprend le style des sections de propositions existantes.",
          "La liste des sagas liees est paginee quand un contenu appartient a beaucoup de sagas.",
          "La section reste masquee automatiquement pour les contenus qui ne sont lies a aucune saga.",
          "Les episodes recuperent aussi les sagas liees a leur serie parente.",
        ],
      },
      {
        title: "Nouvelle video",
        items: [
          "Ajout d'un onglet Sagas pour creer une nouvelle saga.",
          "La creation d'une saga permet de saisir le titre, le resume, le statut Premium et l'affiche.",
          "L'affiche des sagas utilise le meme composant de depot et previsualisation que les series.",
          "Ajout d'un onglet Contenus saga pour lier un film ou une serie entiere a une saga.",
          "Le select Contenu integre une barre de recherche dans le dropdown pour rester utilisable avec beaucoup de contenus.",
        ],
      },
      {
        title: "Administration",
        items: [
          "Ajout d'une section Sagas dans la page Administration pour modifier les sagas existantes.",
          "Les administrateurs peuvent modifier le titre, le resume, l'affiche et le statut Premium d'une saga.",
          "Les contenus d'une saga peuvent etre retires sans supprimer les films ou series associes.",
          "L'ordre des contenus dans une saga peut etre gere par champ numerique ou par drag and drop.",
          "Les sections Series, Sagas et Videos sont harmonisees avec le style des autres cards administrateur.",
        ],
      },
      {
        title: "Corbeille sagas",
        items: [
          "La suppression administrateur place maintenant une saga en corbeille.",
          "Ajout d'une section Corbeille sagas reservee au super administrateur.",
          "Le super administrateur peut restaurer une saga placee en corbeille.",
          "La suppression definitive retire les liaisons, la saga et son dossier d'affiche.",
          "Les films et series lies a une saga ne sont jamais supprimes lors de la suppression de la saga.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout des tables Saga et SagaContent pour stocker les sagas et leurs contenus.",
          "Chaque relation de contenu porte son propre ordre, independant pour chaque saga.",
          "Ajout des endpoints /api/sagas pour lister, creer, modifier, lier, reordonner, restaurer et supprimer les sagas.",
          "Les images de saga sont stockees dans uploads/saga/SagaID/NomDeImage.extension.",
          "L'API limite l'ajout direct aux films sans saison et aux series entieres.",
        ],
      },
    ],
  },
  {
    version: "6.11.0",
    title: "Options supplementaires sur la page Videos",
    date: "21 juin 2026",
    sections: [
      {
        title: "Page Videos",
        items: [
          "Remplacement du reglage direct Series en cours par un dropdown Options.",
          "Le dropdown regroupe maintenant les options Series en cours, Masquer le contenu deja vu, Masquer le contenu premium et Lister les nouveautes.",
          "Les interrupteurs du dropdown reprennent le style du toggle Series en cours existant.",
          "Le bouton Options affiche le nombre d'options actives pour garder la barre de reglages lisible.",
        ],
      },
      {
        title: "Filtres",
        items: [
          "Les options supplementaires peuvent etre combinees avec le tri, la recherche et les genres.",
          "Masquer le contenu deja vu retire les films vus et les series terminees de la liste.",
          "Masquer le contenu premium retire les films et series marques comme premium.",
          "Lister les nouveautes affiche les contenus ajoutes recemment et les series avec nouvel episode recent.",
        ],
      },
      {
        title: "Backend",
        items: [
          "Ajout des parametres hideWatched, hidePremium et newOnly sur l'endpoint GET /api/videos.",
          "Les nouveaux filtres sont appliques avant pagination pour conserver un total et un nombre de pages coherents.",
          "Le calcul du statut vu est reutilise pour filtrer les contenus deja vus et pour conserver les badges existants.",
          "Le filtre Series en cours continue d'utiliser le parametre ongoing deja existant.",
        ],
      },
    ],
  },
  {
    version: "6.10.1",
    title: "Tri recent des series et badge nouvel episode",
    date: "19 juin 2026",
    sections: [
      {
        title: "Page Videos",
        items: [
          "Le tri Ajout - plus recent prend maintenant en compte le dernier episode ajoute dans une serie.",
          "Une serie remonte dans la liste quand un nouvel episode est plus recent que les films et series autour d'elle.",
          "Le comportement reste limite au tri Ajout - plus recent pour conserver les autres tris existants.",
          "Les films continuent d'utiliser leur propre date d'ajout pour ce tri.",
        ],
      },
      {
        title: "Badges",
        items: [
          "Ajout du badge Nouveau episode sur les cards de series.",
          "Le badge s'affiche quand une serie possede un episode actif ajoute il y a moins de 30 jours.",
          "Le badge est affiche avec les badges Premium et Vu deja presents.",
        ],
      },
      {
        title: "Backend",
        items: [
          "L'endpoint GET /api/videos renvoie maintenant la date du dernier episode actif pour les series.",
          "Ajout d'une date de tri dediee aux series pour faire remonter les series avec episode recent.",
          "Ajout d'un indicateur HasNewEpisode pour piloter l'affichage du badge cote frontend.",
        ],
      },
    ],
  },
  {
    version: "6.10.0",
    title: "Sauvegarde manuelle super administrateur",
    date: "18 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Sauvegarde base de donnees dans la page Administration.",
          "La section est reservee au super administrateur.",
          "Le lancement d'une sauvegarde demande le mot de passe du compte connecte.",
          "Une sauvegarde manuelle cree une copie SQL dans backend/BDD.",
          "Une seconde copie est automatiquement telechargee sur l'appareil du super administrateur.",
        ],
      },
      {
        title: "Backend et sauvegardes",
        items: [
          "Ajout d'un service backend reutilisable pour centraliser la creation des sauvegardes SQL.",
          "La sauvegarde hebdomadaire utilise maintenant le meme service que la sauvegarde manuelle.",
          "Les sauvegardes automatiques conservent le format de nom existant.",
          "Les sauvegardes manuelles ajoutent l'heure et le suffixe manual dans le nom du fichier.",
          "Le dossier backend/BDD est cree automatiquement si necessaire.",
        ],
      },
      {
        title: "Securite",
        items: [
          "Ajout de l'endpoint POST /api/admin-backup/manual pour lancer une sauvegarde manuelle.",
          "L'endpoint verifie le token JWT, le role super administrateur et le mot de passe utilisateur.",
          "Le mot de passe de la base de donnees est transmis a mysqldump via l'environnement plutot que dans la commande shell.",
          "La reponse renvoie le fichier SQL en telechargement apres la creation de la copie serveur.",
        ],
      },
      {
        title: "Logs et actions",
        items: [
          "Ajout de l'action manual_database_backup dans seed.js.",
          "Ajout d'une migration pour creer l'action manual_database_backup lors des prochains deploiements.",
          "Chaque sauvegarde manuelle reussie est journalisee avec le chemin du fichier cree.",
          "Les headers de telechargement exposent le nom du fichier au frontend.",
        ],
      },
    ],
  },
  {
    version: "6.9.0",
    title: "Images de contenu et genres par defaut homepage",
    date: "15 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Genres par defaut dans la page Administration.",
          "Les administrateurs peuvent personnaliser les 5 genres utilises par defaut sur la homepage.",
          "Les selects de genres de cette section reprennent le visuel des dropdowns de genres existants.",
          "Ajout d'un composant GenreSelect reutilisable avec recherche, rendu portalise et style SAMI.",
          "Les listes empechent de choisir deux fois le meme genre dans la configuration homepage.",
        ],
      },
      {
        title: "Images films et series",
        items: [
          "Ajout d'un bouton Retirer l'image dans la section administrateur Videos.",
          "Ajout d'un bouton Retirer l'image dans la section administrateur Series.",
          "La suppression retire le chemin de l'image en base de donnees.",
          "La suppression retire aussi physiquement le fichier image stocke dans les uploads.",
          "Les anciens comportements de remplacement d'image restent conserves.",
        ],
      },
      {
        title: "Homepage",
        items: [
          "Les 5 genres de homepage ne sont plus uniquement codes en dur cote frontend.",
          "La homepage recupere maintenant les genres par defaut depuis l'API.",
          "Si aucun utilisateur n'est connecte, les genres par defaut configures sont utilises.",
          "Si un utilisateur n'a pas choisi ses genres, les genres par defaut configures sont utilises.",
          "Si aucune configuration n'existe encore, l'ancien fallback Epique, Romance, Anime, Aventure et Horreur reste utilise.",
        ],
      },
      {
        title: "Parametres utilisateur",
        items: [
          "L'onglet Groupes par genre utilise maintenant les genres par defaut configures comme fallback.",
          "Ajout du bouton Remettre par defaut pour supprimer les preferences personnalisees de l'utilisateur.",
          "Une remise par defaut laisse l'utilisateur suivre automatiquement les futures modifications administrateur.",
          "Les selects de genres utilisateur utilisent le nouveau visuel harmonise avec recherche.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout de la table HomepageDefaultGenre pour stocker les 5 genres de homepage par position.",
          "Ajout de l'endpoint GET /api/genres/homepage-defaults pour recuperer les genres par defaut.",
          "Ajout de l'endpoint PUT /api/genres/homepage-defaults pour mettre a jour les genres par defaut.",
          "Ajout de l'endpoint DELETE /api/videos/:id/image pour retirer l'image d'une video.",
          "Ajout de l'endpoint DELETE /api/series/:id/image pour retirer l'image d'une serie.",
          "Les suppressions d'image sont limitees aux fichiers geres dans le dossier uploads.",
        ],
      },
    ],
  },
  {
    version: "6.8.0",
    title: "Gestion administrateur des videos",
    date: "13 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Videos dans la page Administration.",
          "Ajout d'un select avec recherche pour retrouver rapidement un film ou un episode a gerer.",
          "Ajout d'un formulaire de modification pour le titre, le resume, l'affiche, les genres et le statut premium.",
          "Les episodes affichent leur contexte de serie et de saison directement dans la fiche administrateur.",
          "La section reprend le style des cards administrateur deja presentes pour les series et les genres.",
        ],
      },
      {
        title: "Corbeille videos",
        items: [
          "Le bouton de suppression administrateur ne supprime plus physiquement la video.",
          "Une suppression administrateur place maintenant la video en corbeille avec l'etat Supprimer.",
          "Les videos en corbeille sont masquees des listes publiques, recherches, recommandations, aleatoires, tendances, calendrier et historiques actifs.",
          "Ajout d'une nouvelle section Corbeille videos reservee au super administrateur.",
          "Le super administrateur peut restaurer une video en corbeille ou la supprimer definitivement.",
        ],
      },
      {
        title: "Suppression definitive",
        items: [
          "La suppression definitive supprime les liens genres, personnes, progressions, sous-titres, contenu a la une et fichiers video.",
          "Tous les logs lies a la video sont conserves lors de la suppression definitive.",
          "Les logs conserves sont detaches de la video avant la suppression en base pour eviter les contraintes de relation.",
          "Avant suppression de la video en base, son titre est copie dans AncienneValeur quand cette colonne est disponible.",
          "Les metadonnees des logs conserves gardent les donnees existantes et ajoutent les informations du contenu supprime.",
          "Les anciens champs d'audit restent disponibles dans les metadonnees quand AncienneValeur contenait deja une valeur utile.",
        ],
      },
      {
        title: "Historique de lecture",
        items: [
          "Les historiques affichent maintenant les videos supprimees definitivement quand un log de lecture existe encore.",
          "Le titre des videos supprimees est recupere depuis les logs conserves.",
          "Ajout d'un badge Contenu supprime dans les historiques regroupes et bruts.",
          "Les liens de lecture sont desactives pour les contenus qui n'existent plus.",
          "Les videos en corbeille ou supprimees restent visibles uniquement dans les historiques de lecture.",
        ],
      },
      {
        title: "Backend",
        items: [
          "Ajout de l'endpoint GET /api/videos/admin pour lister les videos administrables.",
          "Ajout de l'endpoint DELETE /api/videos/:id pour placer une video en corbeille.",
          "Ajout de l'endpoint GET /api/videos/admin/deleted pour lister les videos en corbeille.",
          "Ajout de l'endpoint PUT /api/videos/:id/restore pour restaurer une video.",
          "Ajout de l'endpoint DELETE /api/videos/:id/permanent pour supprimer definitivement une video.",
        ],
      },
      {
        title: "Logs et actions",
        items: [
          "Ajout des actions video_delete, video_soft_delete et video_restore dans seed.js.",
          "Ajout des actions serie_delete, saison_update et saison_delete dans seed.js pour aligner les logs des sections administrateur.",
          "Les actions sensibles de restauration et suppression definitive verifient le role super administrateur.",
        ],
      },
    ],
  },
  {
    version: "6.7.0",
    title: "Gestion administrateur des series",
    date: "8 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Series dans la page Administration.",
          "Ajout d'un select avec recherche pour retrouver rapidement la serie a gerer.",
          "Ajout d'un formulaire de modification pour le titre, le resume, l'affiche, les genres et le statut premium.",
          "Ajout de la modification des numeros de saisons directement depuis la fiche administrateur.",
          "Aucune creation de serie n'a ete ajoutee dans cette section, pour garder la creation dans la page Nouvelle video.",
        ],
      },
      {
        title: "Suppression des series et saisons",
        items: [
          "Ajout d'une confirmation avant chaque suppression de saison.",
          "Ajout d'une confirmation avant chaque suppression de serie.",
          "La suppression d'une saison est bloquee si elle est reliee a des videos.",
          "La suppression d'une serie supprime aussi ses saisons uniquement si aucune saison n'est reliee a des videos.",
          "Le feedback affiche les saisons et videos qui bloquent la suppression quand l'action est refusee.",
        ],
      },
      {
        title: "Backend",
        items: [
          "Ajout de l'endpoint GET /api/series/:id pour recuperer les details complets d'une serie.",
          "Ajout des endpoints PUT /api/series/saisons/:saisonId et DELETE /api/series/saisons/:saisonId.",
          "Ajout de l'endpoint DELETE /api/series/:id pour supprimer une serie et ses saisons eligibles.",
          "Les endpoints de modification et suppression des saisons verifient le role administrateur.",
          "Les logs existants sont detaches avant suppression pour eviter les contraintes de relation.",
        ],
      },
      {
        title: "Dropdowns",
        items: [
          "Correction des dropdowns qui passaient sous les autres cards.",
          "Les select Headless UI de series, saisons et contenus lies utilisent maintenant un rendu portalise.",
          "Les dropdowns Genres et Tri sont maintenant rendus hors des cards avec une position fixe.",
          "La correction couvre les pages Nouvelle video, Administration, Details video, Details serie, Personnes et Videos.",
          "Les menus gardent leur largeur alignee avec le bouton tout en restant au-dessus des autres elements.",
        ],
      },
    ],
  },
  {
    version: "6.6.1",
    title: "Ameliorations des formulaires et historiques",
    date: "8 juin 2026",
    sections: [
      {
        title: "Nouvelle video",
        items: [
          "Remplacement du tooltip de la section Fichier Video par un bouton dropdown.",
          "Le tableau des parametres d'encodage s'affiche maintenant dans la carte du fichier video.",
          "Suppression du positionnement fixe qui pouvait placer le tableau trop a droite de l'ecran.",
          "Restylage du tableau avec le design SAMI actuel, en clair et en sombre.",
          "Ajout d'un scroll horizontal pour garder le tableau lisible sur les petits ecrans.",
        ],
      },
      {
        title: "Administration",
        items: [
          "Ajout du toggle Historique brut dans les drawers administrateur.",
          "Ajout du toggle Historique brut dans les drawers utilisateur de la page Administration.",
          "Le toggle reprend le style de celui des Parametres dans la section Contenu regarde.",
          "Les drawers peuvent maintenant alterner entre l'historique regroupe et les logs stricts.",
        ],
      },
      {
        title: "Contenu regarde",
        items: [
          "Ajout du mode brut dans le composant d'historique utilise par le panel administrateur.",
          "Le mode brut affiche les lectures non regroupees, triees de la plus recente a la plus ancienne.",
          "Chaque entree brute conserve le contenu, l'episode si present, la date, l'action, la progression et le lien de lecture.",
          "Ajout d'une pagination dediee au mode brut dans les drawers.",
        ],
      },
    ],
  },
  {
    version: "6.6.0",
    title: "Gestion administrateur des genres",
    date: "8 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Genres dans la page Administration.",
          "Ajout du CRUD administrateur pour creer, renommer et supprimer les genres.",
          "Ajout d'une pagination de 10 genres par page pour garder une liste lisible.",
          "Ajout d'une confirmation avant chaque suppression de genre.",
          "La section reprend le style des cards administrateur existantes.",
        ],
      },
      {
        title: "Suppression des genres",
        items: [
          "La suppression est bloquee quand le genre est relie a des videos, series ou preferences utilisateur.",
          "Le feedback de suppression affiche les types de liens qui empechent la suppression.",
          "Un genre relie uniquement au contenu a la une peut maintenant etre supprime.",
          "Quand ce cas arrive, le contenu a la une associe est supprime avec le genre.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout des endpoints POST /api/genres/admin, PUT /api/genres/admin/:id et DELETE /api/genres/admin/:id.",
          "Les endpoints administrateur verifient le role admin avant modification.",
          "Ajout de contraintes uniques sur Etat.Nom et Genre.Nom dans le schema Prisma.",
          "Ajout d'une migration pour consolider les doublons existants avant l'ajout des index uniques.",
          "Mise a jour de seed.js pour dedupliquer les entrees par Nom avant les createMany.",
        ],
      },
    ],
  },
  {
    version: "6.5.0",
    title: "Message general administrable",
    date: "4 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Message general dans la page Administration.",
          "Ajout d'un formulaire avec titre, description et bouton de validation.",
          "Ajout d'un toggle on/off pour activer ou desactiver l'affichage du message.",
          "Le formulaire reprend le style des cards administrateur existantes.",
        ],
      },
      {
        title: "Banniere generale",
        items: [
          "Ajout d'une banniere generale visible dans l'application quand le message est actif.",
          "La banniere affiche le titre et la description configures par les administrateurs.",
          "La banniere ne s'affiche pas si le toggle est desactive ou si le message est vide.",
          "Ajout d'un bouton pour masquer la banniere cote utilisateur pendant la session.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout de la table AdminMessage avec Titre, Description, Actif, CreateDate et UpdatedAt.",
          "Ajout de l'endpoint GET /api/admin-message pour recuperer la configuration cote admin.",
          "Ajout de l'endpoint PUT /api/admin-message pour mettre a jour le formulaire.",
          "Ajout de l'endpoint PUT /api/admin-message/toggle pour changer l'etat du toggle.",
          "Ajout de l'endpoint GET /api/admin-message/active pour recuperer le message actif cote public.",
        ],
      },
      {
        title: "Logs et actions",
        items: [
          "Ajout de l'action admin_message_update pour tracer les maj du formulaire.",
          "Ajout de l'action admin_message_toggle pour tracer les changements d'etat du toggle.",
          "Ajout des actions dans la migration et dans seed.js pour les prochains deploiements.",
        ],
      },
    ],
  },
  {
    version: "6.4.0",
    title: "Historique de lecture et reprises detaillees",
    date: "2 juin 2026",
    sections: [
      {
        title: "Lecture video",
        items: [
          "Ajout de la nouvelle action video_resume_play lorsqu'un utilisateur reprend une video depuis une progression enregistree.",
          "Le clic Reprendre du modal log maintenant une reprise distincte du premier lancement de la page.",
          "Quand une reprise est acceptee, video_first_play n'est plus logue pour ce lancement.",
          "Le modal Reprendre la lecture est maintenant obligatoire quand une progression existe.",
          "Un clic en dehors du modal ne le ferme plus et fait pulser les boutons Reprendre et Repartir du debut.",
        ],
      },
      {
        title: "Logs et progressions",
        items: [
          "Ajout des timecodes dans les logs de lecture via Meta.",
          "video_first_play conserve son timecode de lecture initial et ne reprend plus les timecodes des reprises.",
          "video_resume_play stocke le timecode de depart et le dernier timecode de progression.",
          "La suppression de progression depuis le modal ne complete plus l'ancien log video_first_play.",
          "Quand la progression est terminee normalement, le log actif est complete avec la duree max de la video.",
        ],
      },
      {
        title: "Contenu regarde",
        items: [
          "Ajout de video_resume_play dans les sections Contenu regarde.",
          "Ajout de barres de progression sur les lectures et reprises affichees dans l'historique.",
          "Les reprises affichent une barre segmentee avec une partie vide avant le timecode de depart.",
          "Ajout d'un mode Historique brut dans les parametres pour afficher les logs stricts, sans regroupement.",
          "Le mode brut conserve la recherche, la pagination, la date, l'heure et les informations du contenu.",
        ],
      },
      {
        title: "Backend et donnees de base",
        items: [
          "Ajout de l'action video_resume_play dans seed.js pour les prochains deploiements.",
          "Correction du seed pour ne plus recreer les utilisateurs par defaut s'ils existent deja.",
          "Le seed utilise maintenant une creation idempotente des utilisateurs par Surnom.",
        ],
      },
    ],
  },
  {
    version: "6.3.1",
    title: "Reprise d'accueil plus intelligente",
    date: "22 mai 2026",
    sections: [
      {
        title: "Accueil",
        items: [
          "Mise a jour de la carte A reprendre sur la page d'accueil.",
          "Priorite conservee sur les videos en cours, films ou episodes, avant toute autre proposition.",
          "Ajout de la reprise du prochain episode de la serie regardee le plus recemment.",
          "Quand cette serie n'a plus d'episode a reprendre, la carte passe a la serie recente suivante, puis aux suivantes.",
          "La suggestion finale utilise maintenant un contenu aleatoire parmi les tendances des 30 derniers jours.",
        ],
      },
      {
        title: "Backend",
        items: [
          "L'endpoint GET /api/videos/progress/resume renvoie maintenant une liste nextSeriesEpisodes.",
          "Le champ nextSeriesEpisode reste disponible pour garder la compatibilite avec l'ancien format.",
        ],
      },
    ],
  },
  {
    version: "6.2.0",
    title: "Listes par genre avec contenu a la une",
    date: "20 mai 2026",
    sections: [
      {
        title: "Accueil",
        items: [
          "Refonte des sections par genre sur la page d'accueil.",
          "Chaque genre affiche maintenant 5 contenus standards et un 6eme contenu mis a la une.",
          "Ajout d'une mise en page dediee inspiree de la section Isekai de reference.",
          "Le contenu a la une dispose d'un badge A la une visible directement sur l'affiche.",
          "Creation du nouveau composant GenreFeaturedVideoSection sans modifier VideoList.",
        ],
      },
      {
        title: "Selection a la une",
        items: [
          "Ajout d'une table GenreFeaturedContent pour relier un genre a un contenu mis en avant.",
          "Le contenu a la une doit posseder le genre de la section ou il est affiche.",
          "Un meme contenu ne peut pas etre a la une sur deux genres en meme temps.",
          "La selection commence par les genres qui ont le moins de contenus disponibles.",
          "Le contenu actif la semaine precedente est exclu de la selection de la semaine suivante.",
        ],
      },
      {
        title: "Rotation automatique",
        items: [
          "Ajout d'une rotation automatique des contenus a la une chaque lundi a 9h00.",
          "La rotation utilise le meme fuseau horaire que la sauvegarde hebdomadaire de la base de donnees.",
          "Ajout d'un service backend reutilise par le cron et par l'action manuelle d'administration.",
          "Ajout de l'endpoint GET /api/genres/featured pour recuperer les contenus a la une actifs.",
          "Ajout de l'endpoint POST /api/genres/featured/refresh pour forcer une nouvelle rotation.",
        ],
      },
      {
        title: "Administration et navigation",
        items: [
          "Ajout d'une section Contenus a la une dans la page Administration.",
          "Les administrateurs peuvent forcer l'actualisation des contenus a la une depuis l'interface.",
          "Le bouton Voir tout des sections par genre redirige vers la page Videos avec le filtre du genre actif.",
          "La page Videos lit maintenant le parametre genres depuis l'URL pour appliquer le filtre automatiquement.",
        ],
      },
    ],
  },
  {
    version: "6.1.1",
    title: "Nouvelle section tendances sur l'accueil",
    date: "19 mai 2026",
    sections: [
      {
        title: "Accueil",
        items: [
          "Remplacement du bloc Les plus regardes par Tendances en ce moment.",
          "Ajout d'une mise en page dediee aux tendances avec une premiere affiche mise en avant.",
          "La premiere affiche affiche maintenant son titre et son genre directement dans le bas de l'image.",
          "Sur mobile, la premiere affiche occupe les deux premieres colonnes pour rester plus grande que les autres.",
          "Ajustement de la taille desktop pour que les 5 affiches tiennent mieux sur la ligne.",
        ],
      },
      {
        title: "Composants",
        items: [
          "Creation du nouveau composant VideoListTendance sans modifier VideoList.",
          "Conservation de l'effet au survol avec flou et resume du film ou de la serie.",
          "Deplacement du badge Premium en haut a droite.",
          "Deplacement du badge Vu en bas a droite, dans le meme esprit visuel que Premium.",
          "Suppression de l'affichage de date sur les cartes tendances.",
        ],
      },
      {
        title: "Navigation",
        items: [
          "Le bouton Voir tout des tendances redirige vers la page Videos.",
          "La page Videos lit maintenant le parametre sort=most depuis l'URL.",
          "Le tri Popularite - la plus vue est applique automatiquement depuis le lien des tendances.",
        ],
      },
    ],
  },
  {
    version: "6.1.0",
    title: "Recommencer une serie sans perdre l'historique",
    date: "18 mai 2026",
    sections: [
      {
        title: "Series",
        items: [
          "Ajout d'un bouton Recommencer la serie sur la page de lecture d'un episode.",
          "Remise a zero des badges vu / non vu d'une serie sans supprimer les logs de lecture.",
          "Les episodes repassent en non vus apres le reset, puis redeviennent vus uniquement lorsqu'ils sont relances.",
          "Le filtre des series en cours prend maintenant en compte la date de remise a zero.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout de la table UserSeriesWatchReset pour stocker la derniere remise a zero par utilisateur et par serie.",
          "Ajout de l'endpoint PUT /api/series/:id/watch-reset pour enregistrer une remise a zero.",
          "Mise a jour du calcul Watched, WatchedCount et WatchedAll pour ignorer les logs anterieurs au dernier reset.",
          "Conservation complete de la table Log pour l'historique, les statistiques et les recommandations.",
        ],
      },
      {
        title: "Accueil",
        items: [
          "Correction de la carte A reprendre sur la page d'accueil.",
          "La carte utilise maintenant l'image de la video pour un film.",
          "La carte utilise maintenant l'image de la serie quand la reprise concerne un episode.",
        ],
      },
    ],
  },
];

const getUpdateAnchor = (version) => `version-${version.replace(/\./g, "-")}`;

export default function UpdatesPage() {
  const [activeVersion, setActiveVersion] = useState(updates[0]?.version || "");

  useEffect(() => {
    const syncVersionFromHash = () => {
      const matchingUpdate = updates.find(
        (update) => `#${getUpdateAnchor(update.version)}` === window.location.hash
      );
      if (matchingUpdate) setActiveVersion(matchingUpdate.version);
    };

    syncVersionFromHash();
    window.addEventListener("hashchange", syncVersionFromHash);

    if (!("IntersectionObserver" in window)) {
      return () => window.removeEventListener("hashchange", syncVersionFromHash);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (first, second) =>
              Math.abs(first.boundingClientRect.top) - Math.abs(second.boundingClientRect.top)
          )[0];

        if (visibleEntry?.target.dataset.version) {
          setActiveVersion(visibleEntry.target.dataset.version);
        }
      },
      {
        rootMargin: "-15% 0px -70% 0px",
        threshold: [0, 0.25, 0.5, 1],
      }
    );

    const updateArticles = updates
      .map((update) => document.getElementById(getUpdateAnchor(update.version)))
      .filter(Boolean);
    updateArticles.forEach((article) => observer.observe(article));

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", syncVersionFromHash);
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-400">
          SAMI
        </p>
        <h1 className="mt-3 text-4xl font-black text-slate-950 dark:text-white">
          Mises a jour
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300">
          Historique des changements importants apportes a l'application.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="min-w-0 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-xl shadow-slate-950/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20">
            <div className="mb-4 px-2">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-300">
                Navigation
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                Versions de SAMI
              </h2>
            </div>

            <nav aria-label="Navigation des mises a jour">
              <ul className="flex gap-2 overflow-x-auto pb-2 lg:max-h-[calc(100vh-13rem)] lg:flex-col lg:overflow-y-auto lg:pr-2">
                {updates.map((update) => {
                  const isActive = update.version === activeVersion;
                  return (
                    <li key={update.version} className="min-w-60 lg:min-w-0">
                      <a
                        href={`#${getUpdateAnchor(update.version)}`}
                        aria-current={isActive ? "location" : undefined}
                        onClick={() => setActiveVersion(update.version)}
                        className={`block rounded-xl border px-3 py-3 transition ${
                          isActive
                            ? "border-sky-400/70 bg-sky-500/15 shadow-sm shadow-sky-500/10"
                            : "border-transparent hover:border-slate-200 hover:bg-slate-100/80 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                        }`}
                      >
                        <span
                          className={`block text-sm font-black ${
                            isActive
                              ? "text-sky-700 dark:text-sky-300"
                              : "text-slate-900 dark:text-white"
                          }`}
                        >
                          Version {update.version}
                        </span>
                        <span className="mt-1 block text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
                          {update.title}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                          {update.date}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          {updates.map((update) => (
            <article
              id={getUpdateAnchor(update.version)}
              data-version={update.version}
              key={update.version}
              aria-labelledby={`update-title-${getUpdateAnchor(update.version)}`}
              className="scroll-mt-28 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20"
            >
              <div className="border-b border-slate-200 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5 dark:border-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-sky-600 dark:text-sky-300">
                      Version {update.version}
                    </p>
                    <h2
                      id={`update-title-${getUpdateAnchor(update.version)}`}
                      className="mt-1 text-2xl font-black text-slate-950 dark:text-white"
                    >
                      {update.title}
                    </h2>
                  </div>
                  <time className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    {update.date}
                  </time>
                </div>
              </div>

              <div className="grid gap-6 px-6 py-6">
                {update.sections.map((section) => (
                  <section key={section.title}>
                    <h3 className="text-base font-bold text-slate-950 dark:text-white">
                      {section.title}
                    </h3>
                    <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                      {section.items.map((item) => (
                        <li key={item} className="flex gap-3">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
