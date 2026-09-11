ALTER TABLE `AiDubbingJob`
  ADD COLUMN `RejectedVoiceReferences` JSON NULL AFTER `VoiceSamples`;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`, `CreateDate`) VALUES
  ('ai_dubbing_voice_profile_accepted', 'Un administrateur accepte explicitement un profil vocal de doublage IA.', 2, CURRENT_TIMESTAMP(3)),
  ('ai_dubbing_voice_profile_rejected', 'Un administrateur refuse explicitement un profil vocal de doublage IA.', 2, CURRENT_TIMESTAMP(3)),
  ('ai_dubbing_voice_profile_regenerated', 'Un administrateur exclut une référence vocale et relance l''analyse du doublage IA.', 2, CURRENT_TIMESTAMP(3)),
  ('ai_dubbing_speaker_added', 'Un administrateur ajoute un intervenant attendu et relance l''analyse du doublage IA.', 2, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `Description` = VALUES(`Description`),
  `Criticite` = VALUES(`Criticite`);
