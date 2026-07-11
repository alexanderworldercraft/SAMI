CREATE TABLE `UserFavoriteContent` (
    `UserFavoriteContentID` BIGINT NOT NULL AUTO_INCREMENT,
    `UserID` INTEGER NOT NULL,
    `VideoID` INTEGER NULL,
    `SeriesID` INTEGER NULL,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_user_favorite_video`(`UserID`, `VideoID`),
    UNIQUE INDEX `uniq_user_favorite_series`(`UserID`, `SeriesID`),
    INDEX `idx_user_favorite_user`(`UserID`),
    INDEX `idx_user_favorite_video`(`VideoID`),
    INDEX `idx_user_favorite_series`(`SeriesID`),
    PRIMARY KEY (`UserFavoriteContentID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserFavoriteContent`
    ADD CONSTRAINT `UserFavoriteContent_UserID_fkey`
    FOREIGN KEY (`UserID`) REFERENCES `Utilisateur`(`UtilisateurID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserFavoriteContent`
    ADD CONSTRAINT `UserFavoriteContent_VideoID_fkey`
    FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserFavoriteContent`
    ADD CONSTRAINT `UserFavoriteContent_SeriesID_fkey`
    FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`)
    ON DELETE CASCADE ON UPDATE CASCADE;
