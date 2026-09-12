# Bibliothèque Voix

La page `/voix` et la section des fiches personnes exigent une session et l’acceptation des conditions IA `2026-09-11-v2`. Ce changement rend les anciens consentements non répondus : le dialogue existant recueille une nouvelle décision pour l’ensemble des fonctions IA.

Les admins et super admins importent un audio ou extraient un passage de la première piste audio d’une vidéo SAMI, l’associent à une personne et consignent leur autorisation. Un original peut servir à plusieurs répliques en français, anglais ou japonais. Les voix entièrement synthétiques et les profils d’âge sont hors de cette version.

Depuis la fiche personne, « Ajouter une voix originale » conserve l’audio sans lancer de génération. L’action « Utiliser comme référence » permet ensuite de créer une réplique à tout moment, y compris à partir d’un original privé. Le formulaire propose un texte de présentation IA modifiable, adapté à la langue sélectionnée ; un texte personnalisé est conservé lors d’un changement de langue.

Originaux et répliques sont privés à la création. La publication est indépendante pour chaque audio. Une réplique publique peut être écoutée sans révéler sa référence privée. Les données d’autorisation et les diagnostics restent réservés aux admins. Les fichiers sont conservés sous `backend/var/voices`, hors des répertoires publics. Inclure ce répertoire dans les sauvegardes avec la table `VoiceAudio`.

Les téléchargements explicites sont réservés aux admins ; les lecteurs ordinaires n’offrent pas de bouton de téléchargement. Comme tout audio écoutable dans un navigateur, le flux peut néanmoins être capturé par son destinataire : ce contrôle ne constitue pas un DRM.

## Déploiement

1. Sauvegarder la base, appliquer `20260911120000_add_voice_library` avec `npx prisma migrate deploy` depuis `backend`, puis `npx prisma generate --generator client`.
2. Déployer le backend et le frontend ensemble. Mettre également à jour les clones de doublage : leur runtime annonce maintenant `voiceLibrary: 1` et accepte `--phase voice`. La commande installée de doublage utilise les scripts du dépôt, dont le nouveau `voice_library.py`.
3. Conserver les réglages `SAMI_AI_DUBBING_*`, les modèles et les certificats du doublage. Le serveur principal coordonne ; les clones compatibles réalisent les générations avec le même moteur, modèle, révision et profil. La page signale l’absence de worker compatible.
4. Sur une instance de validation, importer un original autorisé, générer une réplique et contrôler l’écoute, la comparaison, la publication et le téléchargement avec les trois profils d’accès : admin, utilisateur ayant accepté l’IA, utilisateur ayant refusé l’IA.

La migration n’est pas appliquée automatiquement par le serveur. Les tests unitaires ne valident pas une migration sur MySQL ni une synthèse sur GPU.

## Limites initiales et exploitation

- Référence : 3 à 30 secondes, une seule personne, transcription exacte, fichier importé de 50 Mo maximum. Le fichier importé est conservé à l’identique pour le téléchargement ; un WAV mono 24 kHz sert à l’écoute et au clonage. L’extraction vidéo conserve le passage vocal en WAV.
- Réplique : 500 caractères, durée produite maximale de 180 secondes, exécution limitée à 100 minutes. Le contrôle vocal local et le watermark Perth du doublage sont réutilisés. Aucune synchronisation à une durée vidéo n’est imposée.
- Les clones traitent les voix lorsqu’ils ne prennent pas un doublage. Les attributions voix, sous-titres et encodage vérifient les baux actifs pour éviter de superposer une génération vocale à un autre travail sur le même worker.
- Un bail expiré passe en échec et nécessite une relance admin. Les sorties d’un ancien bail sont rejetées. Une publication exige une sortie prête et watermarquée.
- La fusion de fiches personnes transfère les voix. La corbeille masque leurs audios ; la suppression définitive d’une personne ayant des voix est refusée afin de préserver les originaux et leur attribution.

## Délais de génération

Les répliques de la bibliothèque (500 caractères maximum) disposent de 1 800 secondes par tentative de synthèse, avec au plus trois tentatives après contrôle qualité. Le processus complet est limité à 100 minutes pour inclure le chargement des modèles et les contrôles. Le superviseur Node impose ces délais même si Python ne répond plus. Les répliques de film conservent leur délai de 600 secondes. Déployer ensemble le runtime Python et le superviseur Node sur chaque clone, puis redémarrer SAMI ; aucune réinstallation des modèles n’est nécessaire.

## Consultation, modification et suppression

Les routes `GET /voices/:id`, `PATCH /voices/:id` et `DELETE /voices/:id` complètent la création et la liste. Toutes exigent connexion et consentement IA ; les mutations exigent un administrateur ou super administrateur. La consultation d’un audio privé est réservée aux admins.

L’édition permet de corriger le titre, la langue et le texte. Pour un original, le justificatif peut aussi être corrigé après confirmation ; l’auteur et la date de cette confirmation sont enregistrés. La personne, la source et la nature original/IA restent fixes afin de préserver l’attribution : un autre enregistrement doit être ajouté séparément. Une référence utilisée par une réplique en attente ou en cours ne peut pas changer de transcription ou de langue. Les autorisations déjà copiées sur les répliques conservent leur historique.

Modifier le texte ou la langue d’une réplique exige `regenerate: true` : elle repasse en attente et en privé, sans audio consultable avant la réussite des contrôles. Renommer une réplique conserve son audio et sa visibilité. La génération en cours bloque les modifications et la suppression.

La suppression est définitive après confirmation dans l’interface. Un original reste protégé tant qu’une réplique le référence, quel que soit son état. Les transactions sérialisables et la contrainte de référence protègent les opérations concurrentes. Le dossier audio est retiré après validation de la suppression en base ; un échec de nettoyage est signalé dans l’interface et les journaux, sans rendre le fichier accessible. Aucune migration supplémentaire n’est nécessaire pour ces opérations.

## Transcription automatique des originaux

La transcription est facultative lors de l’ajout : vide ou absente, elle place l’original en `QUEUED`. Un clone de doublage annonçant `voiceTranscription: 1` utilise son moteur local des sous-titres (faster-whisper ou whisper.cpp selon son installation), avec les contrôles de transcription existants, sans traduction ni synthèse Qwen. Le texte source est enregistré sous bail, avec son modèle de provenance ; la langue détectée doit correspondre à celle choisie. L’original devient utilisable après réussite et reste privé. L’interface identifie la transcription initiale comme IA et permet sa correction.

Sur un original existant, effacer le texte demande également sa transcription automatique et le repasse en privé. Une saisie manuelle peut résoudre une demande en attente ou échouée. Un original utilisé par une génération en attente/en cours ne peut pas être modifié. Un échec de transcription est visible et relançable ; il n’efface pas l’enregistrement.

Déployer backend/frontend et clones, puis redémarrer pour renouveler leurs capacités. Le clone doit disposer de l’installation des sous-titres (`npm run setup:ai`) et de sa configuration activée, en plus du doublage. Si aucun clone compatible n’est disponible, la demande attend et l’interface l’indique. Aucune migration supplémentaire n’est nécessaire.
