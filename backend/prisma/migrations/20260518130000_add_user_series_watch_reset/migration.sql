CREATE TABLE `UserSeriesWatchReset` (
    `UserSeriesWatchResetID` BIGINT NOT NULL AUTO_INCREMENT,
    `UserID` INTEGER NOT NULL,
    `SeriesID` INTEGER NOT NULL,
    `ResetAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `CreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_user_series_watch_reset`(`UserID`, `SeriesID`),
    INDEX `idx_user_series_watch_reset_user`(`UserID`),
    INDEX `idx_user_series_watch_reset_series`(`SeriesID`),
    PRIMARY KEY (`UserSeriesWatchResetID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserSeriesWatchReset`
    ADD CONSTRAINT `UserSeriesWatchReset_UserID_fkey`
    FOREIGN KEY (`UserID`) REFERENCES `Utilisateur`(`UtilisateurID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserSeriesWatchReset`
    ADD CONSTRAINT `UserSeriesWatchReset_SeriesID_fkey`
    FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`)
    ON DELETE CASCADE ON UPDATE CASCADE;
