-- CreateTable
CREATE TABLE `VoiceAudio` (
    `VoiceAudioID` VARCHAR(36) NOT NULL,
    `PersonneID` INTEGER NOT NULL,
    `OriginalID` VARCHAR(36) NULL,
    `Kind` VARCHAR(16) NOT NULL,
    `Title` VARCHAR(191) NOT NULL,
    `Language` VARCHAR(8) NOT NULL,
    `Text` TEXT NOT NULL,
    `IsPublic` BOOLEAN NOT NULL DEFAULT false,
    `Status` VARCHAR(16) NOT NULL DEFAULT 'READY',
    `SourceVideoID` INTEGER NULL,
    `SourceStart` DOUBLE NULL,
    `SourceEnd` DOUBLE NULL,
    `UploadName` VARCHAR(191) NULL,
    `Duration` DOUBLE NULL,
    `AuthorizedBy` INTEGER NOT NULL,
    `AuthorizationNote` TEXT NOT NULL,
    `AuthorizedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `CreatedBy` INTEGER NOT NULL,
    `PublishedBy` INTEGER NULL,
    `PublishedAt` DATETIME(3) NULL,
    `Models` JSON NULL,
    `Watermarked` BOOLEAN NOT NULL DEFAULT false,
    `ErrorMessage` TEXT NULL,
    `AssignedWorkerID` VARCHAR(100) NULL,
    `LeaseToken` VARCHAR(64) NULL,
    `LeaseExpiresAt` DATETIME(3) NULL,
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VoiceAudio_PersonneID_IsPublic_Status_idx`(`PersonneID`, `IsPublic`, `Status`),
    INDEX `VoiceAudio_Status_CreatedAt_idx`(`Status`, `CreatedAt`),
    INDEX `VoiceAudio_AssignedWorkerID_Status_LeaseExpiresAt_idx`(`AssignedWorkerID`, `Status`, `LeaseExpiresAt`),
    PRIMARY KEY (`VoiceAudioID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VoiceAudio` ADD CONSTRAINT `VoiceAudio_PersonneID_fkey` FOREIGN KEY (`PersonneID`) REFERENCES `Personne`(`PersonneID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoiceAudio` ADD CONSTRAINT `VoiceAudio_OriginalID_fkey` FOREIGN KEY (`OriginalID`) REFERENCES `VoiceAudio`(`VoiceAudioID`) ON DELETE RESTRICT ON UPDATE CASCADE;

