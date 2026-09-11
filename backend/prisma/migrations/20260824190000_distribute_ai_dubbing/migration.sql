ALTER TABLE `AiDubbingJob`
  ADD COLUMN `VoiceEngine` VARCHAR(64) NOT NULL DEFAULT 'chatterbox',
  ADD COLUMN `VoiceModelRevision` VARCHAR(191) NULL,
  ADD COLUMN `GenerationConfigHash` CHAR(64) NULL,
  ADD COLUMN `InputManifest` JSON NULL,
  ADD COLUMN `InputManifestHash` CHAR(64) NULL,
  ADD COLUMN `ArtifactManifest` JSON NULL,
  ADD COLUMN `ArtifactManifestHash` CHAR(64) NULL,
  ADD COLUMN `AssignedWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  ADD COLUMN `PreferredWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  ADD COLUMN `LeaseTokenHash` CHAR(64) NULL,
  ADD COLUMN `LeaseGeneration` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `LeaseExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `AttemptCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `MaxAttempts` INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN `NextEligibleAt` DATETIME(3) NULL,
  ADD COLUMN `StartedAt` DATETIME(3) NULL,
  ADD COLUMN `CompletedAt` DATETIME(3) NULL;

CREATE TABLE `AiDubbingWorker` (
  `AiDubbingWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `Role` VARCHAR(16) NOT NULL,
  `Ready` BOOLEAN NOT NULL DEFAULT false,
  `Engine` VARCHAR(64) NULL,
  `Device` VARCHAR(120) NULL,
  `Model` VARCHAR(191) NULL,
  `ModelRevision` VARCHAR(191) NULL,
  `PipelineVersion` VARCHAR(64) NOT NULL,
  `PerformanceScore` DOUBLE NOT NULL DEFAULT 1,
  `MaxSlots` INTEGER NOT NULL DEFAULT 1,
  `Capabilities` JSON NULL,
  `BootID` VARCHAR(100) NULL,
  `LastHeartbeatAt` DATETIME(3) NULL,
  `LastError` TEXT NULL,
  `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`AiDubbingWorkerID`),
  INDEX `idx_ai_dubbing_worker_availability` (`Ready`, `LastHeartbeatAt`, `PerformanceScore`),
  CONSTRAINT `AiDubbingWorker_registry_fkey`
    FOREIGN KEY (`AiDubbingWorkerID`) REFERENCES `VideoEncodingWorker` (`VideoEncodingWorkerID`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `idx_ai_dubbing_queue`
  ON `AiDubbingJob` (`Status`, `NextEligibleAt`, `CreatedAt`);
CREATE INDEX `idx_ai_dubbing_worker_status`
  ON `AiDubbingJob` (`AssignedWorkerID`, `Status`);
CREATE INDEX `idx_ai_dubbing_preferred_worker`
  ON `AiDubbingJob` (`PreferredWorkerID`, `LeaseExpiresAt`);
CREATE INDEX `idx_ai_dubbing_lease`
  ON `AiDubbingJob` (`LeaseExpiresAt`);

ALTER TABLE `AiDubbingJob`
  ADD CONSTRAINT `AiDubbingJob_AssignedWorkerID_fkey`
    FOREIGN KEY (`AssignedWorkerID`) REFERENCES `AiDubbingWorker` (`AiDubbingWorkerID`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AiDubbingJob_PreferredWorkerID_fkey`
    FOREIGN KEY (`PreferredWorkerID`) REFERENCES `AiDubbingWorker` (`AiDubbingWorkerID`)
    ON DELETE SET NULL ON UPDATE CASCADE;
