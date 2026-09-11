ALTER TABLE `AiDubbingJob`
  ADD COLUMN `QualityReport` JSON NULL;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`, `CreateDate`) VALUES
  ('ai_dubbing_deleted', 'Un administrateur supprime une version de doublage IA et sa piste synthétique.', 3, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `Description` = VALUES(`Description`),
  `Criticite` = VALUES(`Criticite`);
