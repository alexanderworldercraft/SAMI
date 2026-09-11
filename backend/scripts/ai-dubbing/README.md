# Contrat du runtime local de doublage IA

SAMI n'appelle aucun service IA distant. Le serveur exécute le programme local défini par
`SAMI_AI_DUBBING_COMMAND`, sans shell, avec les accès réseau Hugging Face et Transformers forcés
en mode hors ligne pendant le traitement.

Le runtime reçoit :

```text
runtime --phase preview|full --input /chemin/input.json --output /chemin/output.json
```

`input.json` contient l'audio source local, le WebVTT validé dans la langue cible, les modèles
attendus et les garanties obligatoires. Le programme doit effectuer localement la séparation
dialogue/musique/effets, la diarisation, l'extraction de références vocales, la synthèse multilingue
et le mixage synchronisé. Le pipeline V4 utilise BandIt pour la séparation, pyannote Community-1
pour la diarisation et Qwen3-TTS Base pour la synthèse clonée puis watermarquée.

Le runtime écrit dans `output.json` :

```json
{
  "audioPath": "/chemin/de/travail/result.wav",
  "sourceLanguage": "en",
  "watermarked": true
}
```

Le fichier doit rester dans l'espace de travail fourni par SAMI. Une sortie extérieure, absente ou
non watermarquée est refusée. SAMI fabrique ensuite l'extrait privé ou la rendition HLS, mais ne
publie cette dernière qu'après les deux validations administratives.

Depuis le pipeline `sami-dubbing-v2-stable-voices`, la phase d'extrait analyse la totalité de la
source, crée un manifeste d'attribution et une référence privée par intervenant, puis SAMI les
conserve dans le dossier de la vidéo. La phase complète refuse de démarrer si le manifeste, le
sous-titre, la source ou l'empreinte d'une référence diffère de ce qui a été validé. Chaque réplique
utilise également une graine déterministe indépendante de son ordre de génération.

Depuis `sami-dubbing-v3-guided-speakers`, l'administrateur peut indiquer le nombre réel
d'intervenants. Pyannote applique alors exactement ce nombre sur l'audio original, tandis que
BandIt reste utilisé pour extraire la voix de référence. Une référence provient désormais d'une
seule prise continue, dont les bords sont retirés, au lieu de concaténer plusieurs passages qui
pourraient appartenir à des personnes différentes. Si une prise suffisamment longue est absente,
la génération est bloquée avant validation.

Depuis `sami-dubbing-v5-aligned-quality`, le primary prépare l'audio et les métadonnées dans un
stockage privé, puis un clone autorisé les récupère avec des requêtes signées et un bail court. Le
clone renvoie uniquement des WAV, références et manifestes vérifiés ; le primary reste seul à
écrire dans le dossier de la vidéo et à fabriquer le HLS. Le moteur, le checkpoint, les paramètres
et le clone ayant produit l'extrait restent verrouillés pour la piste complète. Qwen construit une
empreinte réutilisable par intervenant avec la transcription de la référence lorsqu'elle existe.

La révision `sami-dubbing-v5-stable-segmentation-r2` lisse les micro-changements de locuteur
isolés produits par la diarisation, absorbe les fenêtres vocales inférieures à 250 ms et rattache
la ponctuation au mot voisin. Un ancien profil contenant une réplique impossible est refusé avant
le chargement de Qwen et doit être recréé avec cette révision.

La révision `sami-dubbing-v6-hybrid-sortformer-r1` conserve les identités globales et les
empreintes vocales de Community-1, puis utilise NVIDIA Sortformer sur des fenêtres de 90 secondes
(75 secondes utiles et 7,5 secondes de contexte de chaque côté). Les voix locales sont rattachées
aux voix globales par similarité vocale et par affectation bijective : deux voix Sortformer
distinctes ne peuvent donc pas être fusionnées dans le même intervenant. Une fenêtre ambiguë est
refusée localement et revient à Community-1 sans invalider le reste de l'épisode.

La révision `sami-dubbing-v6-hybrid-sortformer-r2` revient aux références vocales globales et
strictement alignées de V5. Un sous-titre reste une réplique indivisible : une frontière de
diarisation ne découpe plus son texte proportionnellement. Community-1 fournit l'intervenant de
référence et Sortformer ne peut le remplacer que lorsque l'attribution globale est ambiguë et que
son résultat local apporte une marge de confiance nettement supérieure.

La révision `sami-dubbing-v6-hybrid-sortformer-r3` sépare le temps d'affichage WebVTT du temps de
parole. Chaque réplique validée conserve ses horodatages de sous-titre, mais reçoit une fenêtre
vocale calculée depuis le transcript source, le tour Community-1 et le silence réellement libre
avant la réplique voisine. La synthèse n'est plus ralentie artificiellement lorsqu'elle est plus
courte que cette fenêtre et reste plafonnée à 1,5× lorsqu'elle doit être accélérée.

La révision `sami-dubbing-v6-hybrid-sortformer-r4` interdit tout démarrage vocal avant le début
validé de la réplique et utilise un début de parole détecté lorsqu'il est plus tardif. Elle retire
le silence ajouté en tête par la synthèse, contrôle le texte de chaque réplique significative et
autorise jusqu'à une seconde de dépassement en fin sans déplacer le début. Elle ne fusionne que les
continuations très proches sans ponctuation terminale. Les références vocales
sont limitées à six secondes et doivent être cohérentes entre Community-1 et la diarisation
raffinée. Une référence refusée par un administrateur est mémorisée puis exclue de la nouvelle
analyse ; l'ajout d'un intervenant augmente le nombre attendu et relance toute la phase d'aperçu.

Le correctif `sami-dubbing-v6-hybrid-sortformer-r4-r1` refuse d'utiliser un début de parole détecté
à moins de 250 ms de la fin du sous-titre. Il revient alors au début WebVTT validé, ce qui évite
les fenêtres vocales nulles sans avancer ni supprimer la réplique. Un job en échec peut être relancé
manuellement depuis l'administration ; la nouvelle analyse repart de l'aperçu et exige à nouveau la
validation explicite de chaque profil vocal.

Le correctif `sami-dubbing-v6-hybrid-sortformer-r4-r2` conserve le début WebVTT lorsque le même
intervenant est déjà actif à cet instant et refuse tout décalage détecté supérieur à 250 ms. Les
interjections de moins de 750 ms ne sont plus fusionnées avec leurs répliques voisines. Au bord
d'un extrait, un reliquat inférieur ou égal à 20 ms après l'accélération maximale est rogné au lieu
de bloquer toute la génération ; cette tolérance ne s'applique pas aux vrais dépassements.

Le pipeline `sami-dubbing-v6-word-speaker-aligned-r8-r3` ajoute un script vocal JSON distinct du
WebVTT, construit à partir du sous-titre validé et du transcript source enrichi. Le runtime synthétise
ensuite une piste par intervenant, conserve séparément l'ambiance BandIt, puis réalise le mixage final.
Son contrôle vocal considère les répliques de quatre unités lexicales ou moins comme des interjections :
il mesure directement leur activité acoustique et ne laisse plus un ASR vide ou physiquement impossible
bloquer une voix non silencieuse. Le désaccord devient un avertissement à écouter ; un vrai silence ou
une expansion vocale dont la durée confirme la répétition reste bloquant.
La régénération d'un profil recharge le manifeste vocal précédent, remplace uniquement la référence
de l'intervenant demandé et conserve les fichiers, validations et graines de synthèse des autres voix.
R8 conserve les blocs WebVTT destinés à l'affichage, mais découpe le script réellement prononcé à
partir des mots horodatés, de la ponctuation et des changements d'intervenant. Une décision Sortformer
forte peut corriger un label Community-1 même lorsque ce dernier paraît temporellement sûr. Les
références vocales utilisent ensuite cette chronologie raffinée et les mots réellement contenus dans
chaque prise, avec un diagnostic détaillé lorsqu'aucun passage propre ne subsiste.

Le correctif `sami-dubbing-v6-clean-phrases-r9` retire les jetons constitués uniquement de
ponctuation avant l'attribution des voix et les rattache au mot lexical voisin. Le texte traduit est
réparti selon les mots réellement prononcés plutôt que selon la durée brute des jetons : un signe
isolé ne peut donc plus voler une réplique ni décaler les suivantes. Une référence Qwen est désormais
limitée à une phrase complète lorsqu'une ponctuation fiable existe dans le transcript. Les réponses
de quatre unités lexicales ou moins utilisent une génération déterministe, l'accélération vocale est
plafonnée à 1,30× et chaque stem reçoit de courts fondus de 8 ms à l'entrée et jusqu'à 35 ms à la
sortie avant le remplissage silencieux. Ces changements réduisent les mots parasites issus du prompt,
les variations de voix sur les interjections et les coupures sèches entre répliques.

Le correctif `sami-dubbing-v6-clean-phrases-r9-r1` rattache également une continuation d'un seul
mot et de 600 ms maximum à la phrase majoritaire lorsqu'une frontière de diarisation artificielle
l'avait isolée. Pour les véritables réponses courtes, Qwen conserve une première tentative sans
échantillonnage, puis produit deux variantes reproductibles à faible température. Le runtime écoute
les trois contrôles et retient la variante au meilleur texte reconnu, puis à la durée la plus propre,
sans relever le plafond d'accélération de 1,30×.

Les profils utilisables sont désormais un registre algorithmique fermé, et non de simples libellés.
`sami-dubbing-v5-aligned-quality` restitue le comportement historique V5 : WebVTT validé, Pyannote
seul, références alignées jusqu'à 12 secondes, découpage brut aux frontières de locuteur, fusion
jusqu'à 8 secondes, échantillonnage Qwen historique, accélération maximale de 1,50× et mixage vocal
direct. `sami-dubbing-v6-clean-phrases-r9-r1` conserve le chemin hybride actuel décrit ci-dessus.
`sami-dubbing-v5-stable-boundaries-r1` conserve la synthèse, les références et les contrôles V5,
mais stabilise les morceaux de moins de 120 ms créés à l'intérieur d'un sous-titre par les
frontières Pyannote. Ces morceaux sont rattachés à un voisin avant la distribution du texte ;
la ponctuation reste attachée aux mots et le nombre de morceaux ne dépasse pas le nombre de
tokens prononçables. Les frontières de locuteur restantes sont conservées, sans lissage global.
Une réplique courte constituant à elle seule un sous-titre n'est pas supprimée ou fusionnée
à un autre intervenant à cause de ce seuil. Les bornes du sous-titre ne sont pas avancées ou
prolongées par cette stabilisation. Cela ne garantit pas une attribution parfaite des voix :
la diarisation reste une estimation et les contrôles vocaux peuvent encore détecter d'autres erreurs.
Créer une nouvelle analyse pour ce profil : les anciens manifestes contiennent l'ancien découpage.
`sami-dubbing-v5-aligned-sentences-r2` ajoute une réparation conservatrice aux règles R1 :
sur une seule phrase complète de quatre secondes au plus, une coupure après un préfixe de
500 ms au plus peut être rattachée à la fin de phrase si elle tombe à l'intérieur du premier mot,
dont le premier intervenant couvre au moins la moitié. Le déplacement est limité à trois secondes.
Le texte et les bornes doivent correspondre exactement aux mots horodatés source (hors ponctuation,
casse et espaces). Deux attributions seulement sont permises. Sans ces indices, R1 reste appliquée.
Les traductions ou éditions sans correspondance source ne déclenchent pas cette réparation.
Le manifeste conserve `speakerBoundaryRepair`, les anciennes unités et un indicateur de contrôle ;
les logs signalent les réparations. Cet indicateur est un diagnostic, pas une nouvelle validation UI.
Les phrases réparées ne sont pas fusionnées ensuite ; leur début reste inchangé. La synthèse V5
et ses seuils ne changent pas. L'attribution corrigée reste une estimation à vérifier à l'écoute.
`sami-dubbing-v5-flexible-tails-r3` ajoute une fin flexible : priorité à la fenêtre d'origine,
sinon durée minimale `duréeSynthétisée / 1.5`. Le départ ne change jamais et aucun départ suivant
n'est décalé. La prolongation et le chevauchement éventuel avec la prochaine réplique sont signalés
dans le contrôle qualité. Les voix sont additionnées au mixage, pas tronquées à la fin du sous-titre.
La préécoute peut être prolongée au-delà de sa fenêtre initiale pour garder ces fins ; la fin réelle
du média source reste une limite bloquante. Les contrôles du texte/CER et les paramètres de voix
V5 sont conservés. Exemple : 1,120 s synthétisées pour 0,271 s disponibles donnent 0,746667 s à
1,5×, soit une prolongation de 0,475667 s, et non un décalage de toute la suite.
Chaque profil possède sa propre empreinte de génération ; le primary et le clone doivent annoncer
le même identifiant et la même empreinte avant qu'un job puisse être attribué. Changer de profil
nécessite donc la même valeur `SAMI_AI_DUBBING_PIPELINE_VERSION` sur les deux machines puis leur
redémarrage. Les nouveaux sous-titres améliorés restent utilisables comme entrée de la V5.

Variables minimales :

```dotenv
SAMI_AI_DUBBING_ENABLED=true
SAMI_AI_DUBBING_WORKER_ENABLED=true
SAMI_AI_DUBBING_COMMAND=/chemin/absolu/vers/le-runtime-local
SAMI_AI_DUBBING_ROOT=/stockage-prive/sami-ai-dubbing
SAMI_AI_DUBBING_PIPELINE_VERSION=sami-dubbing-v6-clean-phrases-r9-r1
SAMI_AI_DUBBING_VOICE_ENGINE=qwen3-tts
SAMI_AI_DUBBING_VOICE_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-Base
```

## Installation du clone NVIDIA

Le runtime Qwen cible Python 3.12 ou 3.11 et une carte NVIDIA CUDA. La RTX 3090 utilise le modèle
1,7B ; une RTX 3070 peut utiliser le 0,6B en changeant le modèle et sa révision. Le script choisit
la build PyTorch CUDA à partir de `nvidia-smi`, installe Qwen3-TTS et BandIt, puis télécharge les
checkpoints dans `backend/var/ai-dubbing`. Les générations sont ensuite forcées hors ligne.
Pour le primary de test HTTPS, copiez seulement son certificat public sur le PC et renseignez
`SAMI_AI_DUBBING_PRIMARY_TLS_CA_FILE` ainsi que son empreinte dans
`SAMI_AI_DUBBING_PRIMARY_TLS_CERT_SHA256`. SAMI vérifie alors le certificat exact sans désactiver TLS.

```powershell
cd backend
npm run setup:ai-dubbing
```

Le propriétaire de l'installation doit ensuite accepter personnellement les conditions de
`pyannote/speaker-diarization-community-1` sur Hugging Face, s'authentifier avec le CLI puis
télécharger le modèle dans le stockage privé du doublage :

```powershell
$env:HF_HOME="$PWD/var/ai-dubbing/cache/huggingface"
./var/ai-dubbing/venv/Scripts/hf.exe auth login
./var/ai-dubbing/venv/Scripts/hf.exe download pyannote/speaker-diarization-community-1 --local-dir "$PWD/var/ai-dubbing/models/pyannote-speaker-diarization-community-1"

npm run setup:ai-dubbing:diarization
npm run setup:ai-dubbing:check
```

V6 exige également le checkpoint public NVIDIA Sortformer. Il est enregistré comme modèle de
test à usage non commercial (`CC-BY-NC-4.0`) et n'est jamais téléchargé pendant une génération :

Sur Windows, vérifier d'abord que WSL2/Ubuntu voit bien la carte NVIDIA et possède les dépendances
de base (ces commandes ne sont nécessaires qu'une fois) :

```powershell
wsl --status
wsl --exec nvidia-smi
wsl --exec sudo apt-get update
wsl --exec sudo apt-get install -y python3-venv python3-pip ffmpeg libsndfile1 build-essential
```

```powershell
./var/ai-dubbing/venv/Scripts/hf.exe download nvidia/diar_sortformer_4spk-v1 diar_sortformer_4spk-v1.nemo --local-dir "$PWD/var/ai-dubbing/models/nvidia-diar-sortformer-4spk-v1"

npm run setup:ai-dubbing:sortformer
npm run setup:ai-dubbing:check
```

Pyannote est installé dans un environnement Python isolé afin de conserver les versions de
PyTorch nécessaires à Qwen, pyannote et BandIt. Sortformer et NVIDIA NeMo utilisent un troisième
environnement isolé. Sous Windows, le setup crée cet environnement dans WSL afin de conserver la
compatibilité CUDA officiellement attendue par NeMo ; WSL et son accès au GPU doivent donc être
opérationnels. Le manifeste enregistre les empreintes SHA-256 de Community-1 et du checkpoint
Sortformer avant leur chargement. Le jeton Hugging Face n'est jamais nécessaire pendant une
génération, la télémétrie est désactivée et tout le traitement est forcé hors ligne.

Configuration applicative après les contrôles réussis :

```dotenv
SAMI_AI_DUBBING_ENABLED=true
SAMI_AI_DUBBING_WORKER_ENABLED=true
SAMI_AI_DUBBING_COMMAND=C:/chemin/vers/backend/scripts/ai-dubbing/runtime.cmd
SAMI_AI_DUBBING_ROOT=C:/chemin/vers/backend/var/ai-dubbing
```

Le checkpoint BandIt v2 Multi est publié sous CC-BY-SA-4.0, indépendamment de la licence du code.
Community-1 est publié sous CC-BY-4.0 et le checkpoint public Sortformer sous CC-BY-NC-4.0. Le
contrôle de santé V6 refuse de déclarer le doublage prêt si Pyannote, Sortformer, CUDA ou leurs
poids locaux sont absents.

Avant un doublage, la vidéo doit posséder un sous-titre validé dans la langue cible.

## Diagnostics des échecs sur le clone

Avant de nettoyer le travail temporaire, le worker conserve les diagnostics dans
`<SAMI_AI_DUBBING_ROOT>/diagnostics/failure-<UUID>/` et affiche ce chemin dans ses logs.
`error.json` indique le job, la vidéo, le profil, l'étape, l'erreur et les fichiers
disponibles ou absents. Le manifeste vocal, les résultats de diarisation et, pour
un blocage vocal V5, `quality-failure.json` sont copiés lorsqu'ils existent.
Ce dernier contient le texte, les horodatages, les durées et le ratio exact du fragment.
Le dossier reste local et privé : aucune route publique n'est ajoutée, aucun audio,
fichier de configuration ou jeton de bail n'est archivé. Les textes des dialogues
restent des données privées. Les dix derniers diagnostics sont conservés ; les
plus anciens sont supprimés à la prochaine archive. Chaque fichier est limité à
8 Mio et les liens symboliques sont ignorés.

Le clone envoie désormais les rapports au primary via `POST /api/internal/ai-dubbing/diagnostics`,
protégé par la signature HMAC, le nonce et l'intégrité du corps des routes internes. Les clones
désactivés sont refusés. Aucun bail actif n'est exigé : un rapport peut arriver après expiration
ou suppression du job. L'identité authentifiée du clone détermine son espace de stockage :
`<SAMI_AI_DUBBING_ROOT>/diagnostics/clones/<SHA256-identifiant-clone>/failure-<UUID>/`.
La réception est atomique et idempotente ; seuls les JSON autorisés sont acceptés, pour un total
de 8 Mio par archive et une enveloppe HTTP de 16 Mio. Dix archives sont gardées par clone sur le primary.
La copie locale reste présente après envoi ; `.transferred.json` enregistre l'accusé de réception
et le primary destinataire. Si le réseau échoue, le worker retente au démarrage et toutes les
60 secondes, au plus deux archives par cycle, sans relancer de génération. Les archives locales
restent soumises à la limite de dix, même hors ligne. Les archives trop volumineuses ne sont pas
envoyées ; un avertissement est journalisé et la copie locale est conservée dans cette limite.

Les blocages du contrôle vocal V5 après ses trois tentatives internes sont déclarés
`AI_DUBBING_INPUT_QUALITY_BLOCKED`, non relançables automatiquement. Cela ne modifie
ni la segmentation ni les paramètres de synthèse du profil V5 figé. Une correction
de segmentation demande une nouvelle variante ; relancer le même job sans corriger
son découpage peut reproduire le même échec.
