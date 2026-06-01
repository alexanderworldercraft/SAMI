CREATE TABLE `GenreFeaturedContent` (
    `GenreFeaturedContentID` BIGINT NOT NULL AUTO_INCREMENT,
    `GenreID` INTEGER NOT NULL,
    `VideoID` INTEGER NULL,
    `SeriesID` INTEGER NULL,
    `ContentKey` VARCHAR(40) NULL,
    `PreviousContentKey` VARCHAR(40) NULL,
    `CandidateCount` INTEGER NOT NULL DEFAULT 0,
    `ActiveFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GenreFeaturedContent_GenreID_key`(`GenreID`),
    INDEX `idx_genre_featured_video`(`VideoID`),
    INDEX `idx_genre_featured_series`(`SeriesID`),
    INDEX `idx_genre_featured_content_key`(`ContentKey`),
    PRIMARY KEY (`GenreFeaturedContentID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GenreFeaturedContent`
    ADD CONSTRAINT `GenreFeaturedContent_GenreID_fkey`
    FOREIGN KEY (`GenreID`) REFERENCES `Genre`(`GenreID`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `GenreFeaturedContent`
    ADD CONSTRAINT `GenreFeaturedContent_VideoID_fkey`
    FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `GenreFeaturedContent`
    ADD CONSTRAINT `GenreFeaturedContent_SeriesID_fkey`
    FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`)
    ON DELETE SET NULL ON UPDATE CASCADE;
