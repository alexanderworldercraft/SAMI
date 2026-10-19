ALTER TABLE `AiSubtitleJob`
  ADD COLUMN `PrimaryApprovedAt` DATETIME(3) NULL,
  ADD COLUMN `PrimaryApprovedByUserID` INTEGER NULL;

ALTER TABLE `AiSubtitleJob` ADD CONSTRAINT `AiSubtitleJob_PrimaryApprovedByUserID_fkey`
  FOREIGN KEY (`PrimaryApprovedByUserID`) REFERENCES `Utilisateur`(`UtilisateurID`)
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`, `CreateDate`) VALUES
  ('ai_subtitle_primary_approved', 'Un administrateur autorise le primary pour un sous-titre IA sans clone disponible.', 2, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `Description` = VALUES(`Description`), `Criticite` = VALUES(`Criticite`);
