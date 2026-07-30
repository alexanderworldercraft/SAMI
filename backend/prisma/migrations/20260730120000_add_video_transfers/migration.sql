CREATE TABLE `VideoTransfer` (
    `VideoTransferID` VARCHAR(36) NOT NULL,
    `Direction` VARCHAR(16) NOT NULL,
    `SourceInstanceID` VARCHAR(100) NOT NULL,
    `SourceVideoID` INTEGER NOT NULL,
    `DestinationVideoID` INTEGER NULL,
    `DestinationSeasonID` INTEGER NULL,
    `InitiatedByUserID` INTEGER NULL,
    `InitiatedByNickname` VARCHAR(191) NULL,
    `RemoteTransferID` VARCHAR(36) NULL,
    `ManifestHash` CHAR(64) NULL,
    `Manifest` JSON NULL,
    `Receipt` JSON NULL,
    `Warnings` JSON NULL,
    `Status` VARCHAR(32) NOT NULL,
    `CurrentStep` VARCHAR(64) NULL,
    `Progress` INTEGER NOT NULL DEFAULT 0,
    `TotalFiles` INTEGER NOT NULL DEFAULT 0,
    `TransferredFiles` INTEGER NOT NULL DEFAULT 0,
    `TotalBytes` BIGINT NOT NULL DEFAULT 0,
    `TransferredBytes` BIGINT NOT NULL DEFAULT 0,
    `CancelRequested` BOOLEAN NOT NULL DEFAULT false,
    `ResumeCount` INTEGER NOT NULL DEFAULT 0,
    `ErrorMessage` TEXT NULL,
    `StartedAt` DATETIME(3) NULL,
    `CompletedAt` DATETIME(3) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_video_transfer_source`(`Direction`, `SourceInstanceID`, `SourceVideoID`),
    INDEX `idx_video_transfer_status_updated`(`Status`, `UpdatedAt`),
    INDEX `idx_video_transfer_remote`(`RemoteTransferID`),
    PRIMARY KEY (`VideoTransferID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VideoTransferFile` (
    `VideoTransferFileID` VARCHAR(36) NOT NULL,
    `VideoTransferID` VARCHAR(36) NOT NULL,
    `RelativePath` VARCHAR(512) NOT NULL,
    `Size` BIGINT NOT NULL,
    `Sha256` CHAR(64) NOT NULL,
    `Status` VARCHAR(24) NOT NULL,
    `BytesReceived` BIGINT NOT NULL DEFAULT 0,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_video_transfer_file_path`(`VideoTransferID`, `RelativePath`),
    INDEX `idx_video_transfer_file_status`(`VideoTransferID`, `Status`),
    PRIMARY KEY (`VideoTransferFileID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VideoTransferStep` (
    `VideoTransferStepID` BIGINT NOT NULL AUTO_INCREMENT,
    `VideoTransferID` VARCHAR(36) NOT NULL,
    `StepKey` VARCHAR(64) NOT NULL,
    `Label` VARCHAR(191) NOT NULL,
    `StatusLabel` VARCHAR(191) NOT NULL,
    `Progress` INTEGER NOT NULL DEFAULT 0,
    `Status` VARCHAR(24) NOT NULL,
    `ErrorMessage` TEXT NULL,
    `StartedAt` DATETIME(3) NULL,
    `CompletedAt` DATETIME(3) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_video_transfer_step`(`VideoTransferID`, `StepKey`),
    INDEX `idx_video_transfer_step_status`(`VideoTransferID`, `Status`),
    PRIMARY KEY (`VideoTransferStepID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VideoTransferFile`
    ADD CONSTRAINT `VideoTransferFile_VideoTransferID_fkey`
    FOREIGN KEY (`VideoTransferID`) REFERENCES `VideoTransfer`(`VideoTransferID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VideoTransferStep`
    ADD CONSTRAINT `VideoTransferStep_VideoTransferID_fkey`
    FOREIGN KEY (`VideoTransferID`) REFERENCES `VideoTransfer`(`VideoTransferID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`)
VALUES
    ('video_export_started', 'Le super administrateur commence l''export d''une vidéo vers le serveur principal.', 2),
    ('video_import_started', 'Le serveur principal commence l''import d''une vidéo depuis un clone.', 2),
    ('video_import_database_created', 'Les données bloquées de la vidéo importée sont ajoutées à la base principale.', 2),
    ('video_transfer_in_progress', 'Le transfert inter-serveurs des fichiers vidéo est en cours.', 1),
    ('video_transfer_completed', 'Le transfert inter-serveurs des fichiers vidéo est terminé et vérifié.', 2),
    ('video_transfer_failed', 'Le transfert inter-serveurs d''une vidéo a échoué.', 3),
    ('video_transfer_cancelled', 'Le transfert inter-serveurs d''une vidéo a été annulé.', 2)
ON DUPLICATE KEY UPDATE
    `Description` = VALUES(`Description`),
    `Criticite` = VALUES(`Criticite`);
