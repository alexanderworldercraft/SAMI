ALTER TABLE `VideoSubtitle`
    ADD COLUMN `Language` VARCHAR(35) NULL,
    ADD COLUMN `Type` VARCHAR(16) NOT NULL DEFAULT 'FULL',
    ADD COLUMN `Origin` VARCHAR(16) NOT NULL DEFAULT 'IMPORTED',
    ADD COLUMN `AiSubtitleJobID` VARCHAR(36) NULL;

UPDATE `VideoSubtitle`
SET `Type` = 'FORCED'
WHERE LOWER(`Label`) LIKE '%forced%'
   OR LOWER(`Label`) LIKE '%forcé%'
   OR LOWER(`Label`) LIKE '%forces%'
   OR LOWER(`Label`) LIKE '%forcés%';

UPDATE `VideoSubtitle`
SET `Type` = 'SDH'
WHERE `Type` = 'FULL'
  AND (LOWER(`Label`) LIKE '%sdh%' OR LOWER(`Label`) LIKE '%malentendant%');

UPDATE `VideoSubtitle`
SET `Language` = 'fr'
WHERE LOWER(`Label`) IN ('fr', 'fre', 'fra', 'french', 'français', 'francais')
   OR LOWER(`Label`) LIKE '%french%'
   OR LOWER(`Label`) LIKE '%français%'
   OR LOWER(`Label`) LIKE '%francais%'
   OR LOWER(`CheminSubtitle`) REGEXP '(^|/)(fr|fre|fra)[_.-]';

CREATE TABLE `AiSubtitleWorker` (
    `AiSubtitleWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `Role` VARCHAR(16) NOT NULL,
    `Ready` BOOLEAN NOT NULL DEFAULT false,
    `Engine` VARCHAR(64) NULL,
    `Device` VARCHAR(64) NULL,
    `Model` VARCHAR(120) NULL,
    `TranslationModel` VARCHAR(191) NULL,
    `PipelineVersion` VARCHAR(64) NOT NULL,
    `PerformanceScore` DOUBLE NOT NULL DEFAULT 1,
    `MaxSlots` INTEGER NOT NULL DEFAULT 1,
    `Capabilities` JSON NULL,
    `BootID` VARCHAR(100) NULL,
    `LastHeartbeatAt` DATETIME(3) NULL,
    `LastError` TEXT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`AiSubtitleWorkerID`),
    INDEX `idx_ai_subtitle_worker_availability` (`Ready`, `LastHeartbeatAt`, `PerformanceScore`),
    CONSTRAINT `AiSubtitleWorker_registry_fkey`
        FOREIGN KEY (`AiSubtitleWorkerID`) REFERENCES `VideoEncodingWorker`(`VideoEncodingWorkerID`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiSubtitleJob` (
    `AiSubtitleJobID` VARCHAR(36) NOT NULL,
    `VideoID` INTEGER NOT NULL,
    `TargetLanguage` VARCHAR(35) NOT NULL,
    `RequestedByUserID` INTEGER NULL,
    `Automatic` BOOLEAN NOT NULL DEFAULT false,
    `Status` VARCHAR(24) NOT NULL,
    `Phase` VARCHAR(32) NULL,
    `Progress` INTEGER NOT NULL DEFAULT 0,
    `SourceRelativePath` VARCHAR(512) NULL,
    `SourceSize` BIGINT NULL,
    `SourceSha256` CHAR(64) NULL,
    `AssignedWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    `LeaseTokenHash` CHAR(64) NULL,
    `LeaseGeneration` INTEGER NOT NULL DEFAULT 0,
    `LeaseExpiresAt` DATETIME(3) NULL,
    `AttemptCount` INTEGER NOT NULL DEFAULT 0,
    `MaxAttempts` INTEGER NOT NULL DEFAULT 4,
    `NextEligibleAt` DATETIME(3) NULL,
    `SourceLanguage` VARCHAR(35) NULL,
    `TranscriptionModel` VARCHAR(120) NULL,
    `TranslationModel` VARCHAR(191) NULL,
    `PipelineVersion` VARCHAR(64) NOT NULL,
    `ErrorMessage` TEXT NULL,
    `StartedAt` DATETIME(3) NULL,
    `CompletedAt` DATETIME(3) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`AiSubtitleJobID`),
    UNIQUE INDEX `uniq_ai_subtitle_video_language` (`VideoID`, `TargetLanguage`),
    INDEX `idx_ai_subtitle_job_queue` (`Status`, `NextEligibleAt`, `CreatedAt`),
    INDEX `idx_ai_subtitle_job_worker` (`AssignedWorkerID`, `Status`),
    INDEX `idx_ai_subtitle_job_lease` (`LeaseExpiresAt`),
    INDEX `idx_ai_subtitle_job_requester` (`RequestedByUserID`),
    CONSTRAINT `AiSubtitleJob_video_fkey`
        FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `AiSubtitleJob_requester_fkey`
        FOREIGN KEY (`RequestedByUserID`) REFERENCES `Utilisateur`(`UtilisateurID`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `AiSubtitleJob_worker_fkey`
        FOREIGN KEY (`AssignedWorkerID`) REFERENCES `AiSubtitleWorker`(`AiSubtitleWorkerID`)
        ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiVideoTranscript` (
    `VideoID` INTEGER NOT NULL,
    `SourceLanguage` VARCHAR(35) NOT NULL,
    `Segments` JSON NOT NULL,
    `PlainText` LONGTEXT NULL,
    `TranscriptionModel` VARCHAR(120) NOT NULL,
    `PipelineVersion` VARCHAR(64) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`VideoID`),
    CONSTRAINT `AiVideoTranscript_video_fkey`
        FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`)
        ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VideoSubtitle`
    ADD UNIQUE INDEX `VideoSubtitle_AiSubtitleJobID_key` (`AiSubtitleJobID`),
    ADD CONSTRAINT `VideoSubtitle_AiSubtitleJobID_fkey`
        FOREIGN KEY (`AiSubtitleJobID`) REFERENCES `AiSubtitleJob`(`AiSubtitleJobID`)
        ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `AppSetting` (`Cle`, `Valeur`)
VALUES ('ai_subtitles', JSON_OBJECT('active', false))
ON DUPLICATE KEY UPDATE `Cle` = `Cle`;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`, `CreateDate`) VALUES
    ('ai_subtitles_toggle', 'Un administrateur modifie l''activation des sous-titres générés par IA.', 2, CURRENT_TIMESTAMP(3)),
    ('ai_subtitle_requested', 'Un utilisateur demande la génération d''un sous-titre.', 1, CURRENT_TIMESTAMP(3)),
    ('ai_subtitle_completed', 'Une génération locale de sous-titre est terminée.', 1, CURRENT_TIMESTAMP(3)),
    ('ai_subtitle_failed', 'Une génération locale de sous-titre a échoué.', 2, CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
    `Description` = VALUES(`Description`),
    `Criticite` = VALUES(`Criticite`);
