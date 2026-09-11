CREATE TABLE `UserAiPreference` (
  `UtilisateurID` INTEGER NOT NULL,
  `Accepted` BOOLEAN NOT NULL,
  `DisclosureVersion` VARCHAR(32) NOT NULL,
  `DecidedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `UpdateDate` DATETIME(3) NOT NULL,

  PRIMARY KEY (`UtilisateurID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserAiPreference`
  ADD CONSTRAINT `UserAiPreference_UtilisateurID_fkey`
  FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VideoAudioTrack`
  ADD COLUMN `Origin` VARCHAR(16) NOT NULL DEFAULT 'IMPORTED',
  ADD COLUMN `Synthetic` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `DisclosureVersion` VARCHAR(32) NULL,
  ADD COLUMN `AiDubbingJobID` VARCHAR(36) NULL;

CREATE TABLE `AiDubbingJob` (
  `AiDubbingJobID` VARCHAR(36) NOT NULL,
  `VideoID` INTEGER NOT NULL,
  `TargetLanguage` VARCHAR(8) NOT NULL,
  `SourceLanguage` VARCHAR(8) NULL,
  `RequestedByUserID` INTEGER NULL,
  `Status` VARCHAR(32) NOT NULL,
  `Phase` VARCHAR(32) NULL,
  `Progress` INTEGER NOT NULL DEFAULT 0,
  `PreviewRelativePath` VARCHAR(512) NULL,
  `FinalPlaylistPath` VARCHAR(512) NULL,
  `VoiceModel` VARCHAR(120) NOT NULL,
  `DiarizationModel` VARCHAR(191) NOT NULL,
  `SeparationModel` VARCHAR(191) NOT NULL,
  `PipelineVersion` VARCHAR(64) NOT NULL,
  `DisclosureVersion` VARCHAR(32) NOT NULL,
  `Watermarked` BOOLEAN NOT NULL DEFAULT true,
  `ErrorMessage` TEXT NULL,
  `PreviewApprovedByUserID` INTEGER NULL,
  `PreviewApprovedAt` DATETIME(3) NULL,
  `FinalApprovedByUserID` INTEGER NULL,
  `FinalApprovedAt` DATETIME(3) NULL,
  `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`AiDubbingJobID`),
  INDEX `idx_ai_dubbing_video_language_status` (`VideoID`, `TargetLanguage`, `Status`),
  INDEX `idx_ai_dubbing_status_created` (`Status`, `CreatedAt`),
  INDEX `idx_ai_dubbing_requester` (`RequestedByUserID`),
  INDEX `AiDubbingJob_PreviewApprovedByUserID_fkey` (`PreviewApprovedByUserID`),
  INDEX `AiDubbingJob_FinalApprovedByUserID_fkey` (`FinalApprovedByUserID`),
  CONSTRAINT `AiDubbingJob_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video` (`VideoID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AiDubbingJob_RequestedByUserID_fkey` FOREIGN KEY (`RequestedByUserID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AiDubbingJob_PreviewApprovedByUserID_fkey` FOREIGN KEY (`PreviewApprovedByUserID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AiDubbingJob_FinalApprovedByUserID_fkey` FOREIGN KEY (`FinalApprovedByUserID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `VideoAudioTrack_AiDubbingJobID_key` ON `VideoAudioTrack`(`AiDubbingJobID`);
ALTER TABLE `VideoAudioTrack`
  ADD CONSTRAINT `VideoAudioTrack_AiDubbingJobID_fkey`
  FOREIGN KEY (`AiDubbingJobID`) REFERENCES `AiDubbingJob`(`AiDubbingJobID`)
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`, `CreateDate`) VALUES
  ('ai_features_preference_update', 'Un utilisateur accepte ou refuse l''accès aux fonctionnalités IA.', 1, CURRENT_TIMESTAMP(3)),
  ('ai_dubbing_preview_requested', 'Un administrateur demande un extrait de doublage IA local.', 2, CURRENT_TIMESTAMP(3)),
  ('ai_dubbing_preview_approved', 'Un administrateur valide l''extrait d''un doublage IA.', 2, CURRENT_TIMESTAMP(3)),
  ('ai_dubbing_rejected', 'Un administrateur refuse un doublage IA avant publication.', 2, CURRENT_TIMESTAMP(3)),
  ('ai_dubbing_published', 'Un administrateur valide et publie une piste de doublage IA.', 3, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `Description` = VALUES(`Description`),
  `Criticite` = VALUES(`Criticite`);
