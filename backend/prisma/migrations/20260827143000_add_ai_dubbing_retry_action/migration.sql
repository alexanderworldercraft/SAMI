INSERT INTO `Action` (`Nom`, `Description`, `Criticite`, `CreateDate`) VALUES
  ('ai_dubbing_analysis_retried', 'Un administrateur relance manuellement l''analyse d''un doublage IA en échec.', 2, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `Description` = VALUES(`Description`),
  `Criticite` = VALUES(`Criticite`);
