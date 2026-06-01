CREATE TABLE `UserVideoProgress` (
    `UserVideoProgressID` BIGINT NOT NULL AUTO_INCREMENT,
    `UserID` INTEGER NOT NULL,
    `VideoID` INTEGER NOT NULL,
    `Timecode` INTEGER NOT NULL,
    `Duration` INTEGER NOT NULL,
    `ProgressPercent` DECIMAL(5,2) GENERATED ALWAYS AS ((`Timecode` / `Duration`) * 100) STORED,
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_user_video`(`UserID`, `VideoID`),
    INDEX `idx_user_video_progress_user`(`UserID`),
    INDEX `idx_user_video_progress_video`(`VideoID`),
    PRIMARY KEY (`UserVideoProgressID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserVideoProgress`
    ADD CONSTRAINT `UserVideoProgress_UserID_fkey`
    FOREIGN KEY (`UserID`) REFERENCES `Utilisateur`(`UtilisateurID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserVideoProgress`
    ADD CONSTRAINT `UserVideoProgress_VideoID_fkey`
    FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`)
    ON DELETE CASCADE ON UPDATE CASCADE;
