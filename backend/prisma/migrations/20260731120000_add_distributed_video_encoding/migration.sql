CREATE TABLE `VideoEncodingWorker` (
    `VideoEncodingWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `DisplayName` VARCHAR(191) NULL,
    `Role` VARCHAR(16) NOT NULL,
    `Enabled` BOOLEAN NOT NULL DEFAULT false,
    `Draining` BOOLEAN NOT NULL DEFAULT false,
    `ProtocolVersion` INTEGER NOT NULL DEFAULT 1,
    `PipelineVersion` VARCHAR(64) NOT NULL,
    `Platform` VARCHAR(64) NULL,
    `Architecture` VARCHAR(64) NULL,
    `FfmpegVersion` VARCHAR(191) NULL,
    `MaxNominalHeight` INTEGER NOT NULL DEFAULT 0,
    `SupportsH264` BOOLEAN NOT NULL DEFAULT true,
    `SupportsAac` BOOLEAN NOT NULL DEFAULT true,
    `MaxSlots` INTEGER NOT NULL DEFAULT 1,
    `PerformanceScore` DOUBLE NOT NULL DEFAULT 1,
    `Capabilities` JSON NULL,
    `BootID` VARCHAR(100) NULL,
    `LastHeartbeatAt` DATETIME(3) NULL,
    `LastError` TEXT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_encoding_worker_availability`(`Role`, `Enabled`, `LastHeartbeatAt`),
    INDEX `idx_encoding_worker_capability`(`PipelineVersion`, `MaxNominalHeight`),
    PRIMARY KEY (`VideoEncodingWorkerID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VideoEncodingJob` (
    `VideoEncodingJobID` VARCHAR(36) NOT NULL,
    `VideoID` INTEGER NULL,
    `IdempotencyKey` VARCHAR(191) NULL,
    `InitiatedByUserID` INTEGER NULL,
    `Status` VARCHAR(32) NOT NULL,
    `CurrentStep` VARCHAR(64) NULL,
    `Progress` INTEGER NOT NULL DEFAULT 0,
    `SourceRelativePath` VARCHAR(512) NOT NULL,
    `SourceOriginalName` VARCHAR(255) NOT NULL,
    `SourceSize` BIGINT NOT NULL,
    `SourceSha256` CHAR(64) NOT NULL,
    `SourceMetadata` JSON NULL,
    `RequestSnapshot` JSON NOT NULL,
    `PipelineVersion` VARCHAR(64) NOT NULL,
    `EncodingSpecHash` CHAR(64) NOT NULL,
    `CancelRequested` BOOLEAN NOT NULL DEFAULT false,
    `ErrorMessage` TEXT NULL,
    `Warnings` JSON NULL,
    `NoCloneSinceAt` DATETIME(3) NULL,
    `StartedAt` DATETIME(3) NULL,
    `CompletedAt` DATETIME(3) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_encoding_job_idempotency`(`InitiatedByUserID`, `IdempotencyKey`),
    INDEX `idx_encoding_job_status_updated`(`Status`, `UpdatedAt`),
    INDEX `idx_encoding_job_video`(`VideoID`),
    PRIMARY KEY (`VideoEncodingJobID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VideoEncodingTask` (
    `VideoEncodingTaskID` VARCHAR(36) NOT NULL,
    `VideoEncodingJobID` VARCHAR(36) NOT NULL,
    `TaskKey` VARCHAR(100) NOT NULL,
    `Kind` VARCHAR(32) NOT NULL,
    `ProfileLabel` VARCHAR(32) NULL,
    `NominalHeight` INTEGER NULL,
    `Priority` INTEGER NOT NULL DEFAULT 0,
    `Weight` BIGINT NOT NULL DEFAULT 0,
    `Required` BOOLEAN NOT NULL DEFAULT true,
    `Spec` JSON NOT NULL,
    `SpecHash` CHAR(64) NOT NULL,
    `Status` VARCHAR(24) NOT NULL,
    `Phase` VARCHAR(24) NULL,
    `AssignedWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    `PreferredWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    `PreferenceExpiresAt` DATETIME(3) NULL,
    `LeaseTokenHash` CHAR(64) NULL,
    `LeaseGeneration` INTEGER NOT NULL DEFAULT 0,
    `LeaseExpiresAt` DATETIME(3) NULL,
    `AttemptCount` INTEGER NOT NULL DEFAULT 0,
    `MaxAttempts` INTEGER NOT NULL DEFAULT 4,
    `NextEligibleAt` DATETIME(3) NULL,
    `Progress` INTEGER NOT NULL DEFAULT 0,
    `ArtifactManifest` JSON NULL,
    `ArtifactManifestHash` CHAR(64) NULL,
    `ErrorMessage` TEXT NULL,
    `StartedAt` DATETIME(3) NULL,
    `CompletedAt` DATETIME(3) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_encoding_task_key`(`VideoEncodingJobID`, `TaskKey`),
    INDEX `idx_encoding_task_queue`(`Status`, `NextEligibleAt`, `Priority`),
    INDEX `idx_encoding_task_lease_expiry`(`LeaseExpiresAt`),
    INDEX `idx_encoding_task_worker_status`(`AssignedWorkerID`, `Status`),
    INDEX `idx_encoding_task_preference`(`PreferredWorkerID`, `PreferenceExpiresAt`),
    PRIMARY KEY (`VideoEncodingTaskID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VideoEncodingTaskAttempt` (
    `VideoEncodingTaskAttemptID` VARCHAR(36) NOT NULL,
    `VideoEncodingTaskID` VARCHAR(36) NOT NULL,
    `VideoEncodingWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `AttemptNumber` INTEGER NOT NULL,
    `LeaseGeneration` INTEGER NOT NULL,
    `Status` VARCHAR(24) NOT NULL,
    `Progress` INTEGER NOT NULL DEFAULT 0,
    `ManifestHash` CHAR(64) NULL,
    `ErrorMessage` TEXT NULL,
    `StartedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `LastRenewedAt` DATETIME(3) NULL,
    `CompletedAt` DATETIME(3) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_encoding_task_attempt`(`VideoEncodingTaskID`, `AttemptNumber`),
    INDEX `idx_encoding_attempt_worker_status`(`VideoEncodingWorkerID`, `Status`),
    PRIMARY KEY (`VideoEncodingTaskAttemptID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VideoEncodingArtifactFile` (
    `VideoEncodingArtifactFileID` VARCHAR(36) NOT NULL,
    `VideoEncodingTaskAttemptID` VARCHAR(36) NOT NULL,
    `RelativePath` VARCHAR(512) NOT NULL,
    `Size` BIGINT NOT NULL,
    `Sha256` CHAR(64) NOT NULL,
    `Status` VARCHAR(24) NOT NULL,
    `BytesReceived` BIGINT NOT NULL DEFAULT 0,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_encoding_artifact_path`(`VideoEncodingTaskAttemptID`, `RelativePath`),
    INDEX `idx_encoding_artifact_status`(`VideoEncodingTaskAttemptID`, `Status`),
    PRIMARY KEY (`VideoEncodingArtifactFileID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `VideoEncodingRequestNonce` (
    `VideoEncodingRequestNonceID` BIGINT NOT NULL AUTO_INCREMENT,
    `VideoEncodingWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `Nonce` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    `ExpiresAt` DATETIME(3) NOT NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_encoding_request_nonce`(`VideoEncodingWorkerID`, `Nonce`),
    INDEX `idx_encoding_request_nonce_expiry`(`ExpiresAt`),
    PRIMARY KEY (`VideoEncodingRequestNonceID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VideoEncodingTask`
    ADD CONSTRAINT `VideoEncodingTask_VideoEncodingJobID_fkey`
    FOREIGN KEY (`VideoEncodingJobID`) REFERENCES `VideoEncodingJob`(`VideoEncodingJobID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VideoEncodingTask`
    ADD CONSTRAINT `VideoEncodingTask_AssignedWorkerID_fkey`
    FOREIGN KEY (`AssignedWorkerID`) REFERENCES `VideoEncodingWorker`(`VideoEncodingWorkerID`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VideoEncodingTask`
    ADD CONSTRAINT `VideoEncodingTask_PreferredWorkerID_fkey`
    FOREIGN KEY (`PreferredWorkerID`) REFERENCES `VideoEncodingWorker`(`VideoEncodingWorkerID`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VideoEncodingTaskAttempt`
    ADD CONSTRAINT `VideoEncodingTaskAttempt_VideoEncodingTaskID_fkey`
    FOREIGN KEY (`VideoEncodingTaskID`) REFERENCES `VideoEncodingTask`(`VideoEncodingTaskID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VideoEncodingTaskAttempt`
    ADD CONSTRAINT `VideoEncodingTaskAttempt_VideoEncodingWorkerID_fkey`
    FOREIGN KEY (`VideoEncodingWorkerID`) REFERENCES `VideoEncodingWorker`(`VideoEncodingWorkerID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `VideoEncodingArtifactFile`
    ADD CONSTRAINT `VideoEncodingArtifactFile_VideoEncodingTaskAttemptID_fkey`
    FOREIGN KEY (`VideoEncodingTaskAttemptID`) REFERENCES `VideoEncodingTaskAttempt`(`VideoEncodingTaskAttemptID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VideoEncodingRequestNonce`
    ADD CONSTRAINT `VideoEncodingRequestNonce_VideoEncodingWorkerID_fkey`
    FOREIGN KEY (`VideoEncodingWorkerID`) REFERENCES `VideoEncodingWorker`(`VideoEncodingWorkerID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `AppSetting` (`Cle`, `Valeur`)
VALUES ('distributed_encoding', JSON_OBJECT('active', false))
ON DUPLICATE KEY UPDATE `Cle` = `Cle`;

INSERT INTO `Action` (`Nom`, `Description`, `Criticite`)
VALUES
    ('distributed_encoding_toggle', 'Changement d''état de l''encodage vidéo distribué expérimental.', 2),
    ('distributed_encoding_worker_updated', 'Modification d''un worker du registre d''encodage distribué.', 2),
    ('distributed_encoding_job_started', 'Démarrage d''un encodage vidéo distribué.', 2),
    ('distributed_encoding_job_completed', 'Publication réussie d''un encodage vidéo distribué.', 2),
    ('distributed_encoding_job_failed', 'Échec d''un encodage vidéo distribué.', 3),
    ('distributed_encoding_job_cancelled', 'Annulation d''un encodage vidéo distribué.', 2)
ON DUPLICATE KEY UPDATE
    `Description` = VALUES(`Description`),
    `Criticite` = VALUES(`Criticite`);
