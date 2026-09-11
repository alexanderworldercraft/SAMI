# Clone de doublage sur Apple Silicon

Le moteur Qwen3-TTS conserve les mêmes checkpoints et profils que le clone NVIDIA. Le runtime sélectionne CUDA en bfloat16/SDPA sur NVIDIA et Metal (MPS) en float32 avec attention eager sur Apple Silicon. SDPA/GQA avec PyTorch 2.6 provoquait un arrêt natif de Metal lors de la génération ; le chemin eager évite cette opération.

Bandit utilise MLX sur le GPU Apple. Pyannote, le contrôle vocal faster-whisper et Sortformer s’exécutent sur CPU. Le checkpoint Sortformer reste celui du pipeline hybride R9 ; le modèle n’est pas remplacé par un autre algorithme.

## Installation

Depuis `backend` :

```sh
brew install sox
npm run setup:ai-dubbing
npm run setup:ai-dubbing:diarization
npm run setup:ai-dubbing:sortformer
npm run setup:ai-dubbing:check
```

Les commandes Pyannote et Sortformer exigent leurs checkpoints locaux aux emplacements indiqués par l’installateur. Utiliser les révisions prévues dans `scripts/setupAiDubbing.mjs` et les autorisations d’accès aux modèles déjà requises par SAMI.

Une installation partielle peut réussir tout en laissant le clone indisponible : chaque étape valide son composant, tandis que `setup:ai-dubbing:check` exige tous les composants du profil. R9 exige notamment Pyannote **et** Sortformer. Le moteur vocal ne doit pas partager son environnement Python avec Chatterbox : les versions requises de `transformers` sont incompatibles. L’installateur refuse désormais ce mélange avant les mutations pip. Les modèles téléchargés restent indépendants des paquets Python.

Le Mac doit avoir Metal accessible au processus qui lance SAMI. Un sandbox sans accès au GPU peut renvoyer `MPS available: false` même sur Apple Silicon. Ce résultat ne doit pas être transformé artificiellement en état prêt.

## Configuration et vérification

Conserver les paramètres de clone existants (`SAMI_INSTANCE_ROLE=clone`, identifiant, serveur principal, secret et certificats), ainsi que le modèle, sa révision et le profil compatibles avec le principal. Redémarrer le processus SAMI après mise à jour du code et de l’installation pour renouveler l’annonce de capacités.

Le contrôle de santé vérifie les modèles et environnements. Il ne remplace pas un test réel. La validation locale du 11 septembre 2026 a utilisé une référence créée avec une voix synthétique macOS, sans enregistrement de personne : une réplique française de 3,28 s a été générée en 44,133 s, chargement et contrôle vocal compris, avec une confiance de watermark de 1,0. Ce résultat ponctuel n’est pas une estimation du débit sur un film. Sortformer et Pyannote sur CPU rendent ce clone potentiellement plus lent qu’un clone NVIDIA.

Les artefacts locaux de cette validation sont dans `var/ai-dubbing/mac-validation`, notamment `voice.wav` et `output.json`. Ils ne sont pas publiés dans la bibliothèque de voix.

Sur le même extrait synthétique de 5,422 s, la séparation Bandit/MLX a réussi en 70,4 s, Sortformer/CPU en 12,84 s et Pyannote/CPU en 7,72 s ; les deux diariseurs ont trouvé un intervenant. Ce test valide les composants réels, sans constituer un doublage de film ni un test d'attribution depuis le serveur principal.

Lors de la vérification, le `.env` du Mac annonçait encore `sami-dubbing-v5-english-identity-r5-r4`. L’installation prend également en charge R9, mais le profil annoncé doit être identique à celui des tâches du principal. Ne pas déduire l'alignement des profils de la seule présence des modèles.
