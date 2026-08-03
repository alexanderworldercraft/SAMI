-- CreateTable
CREATE TABLE `UniverseContent` (
    `UniverseContentID` INTEGER NOT NULL AUTO_INCREMENT,
    `UniverseID` INTEGER NOT NULL,
    `VideoID` INTEGER NULL,
    `SeriesID` INTEGER NULL,
    `Ordre` INTEGER NOT NULL DEFAULT 0,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_universe_video`(`UniverseID`, `VideoID`),
    UNIQUE INDEX `uniq_universe_series`(`UniverseID`, `SeriesID`),
    INDEX `idx_universe_content_order`(`UniverseID`, `Ordre`),
    INDEX `UniverseContent_VideoID_fkey`(`VideoID`),
    INDEX `UniverseContent_SeriesID_fkey`(`SeriesID`),
    PRIMARY KEY (`UniverseContentID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UniverseContent` ADD CONSTRAINT `UniverseContent_UniverseID_fkey` FOREIGN KEY (`UniverseID`) REFERENCES `Universe`(`UniverseID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UniverseContent` ADD CONSTRAINT `UniverseContent_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UniverseContent` ADD CONSTRAINT `UniverseContent_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`) ON DELETE CASCADE ON UPDATE CASCADE;
