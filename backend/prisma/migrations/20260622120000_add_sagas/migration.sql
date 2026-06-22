-- CreateTable
CREATE TABLE `Saga` (
    `SagaID` INTEGER NOT NULL AUTO_INCREMENT,
    `Titre` VARCHAR(100) NOT NULL,
    `Resumer` TEXT NULL,
    `CheminImage` VARCHAR(255) NULL,
    `EtatID` INTEGER NOT NULL,
    `Premium` BOOLEAN NOT NULL DEFAULT false,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Saga_EtatID_fkey`(`EtatID`),
    PRIMARY KEY (`SagaID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SagaContent` (
    `SagaContentID` INTEGER NOT NULL AUTO_INCREMENT,
    `SagaID` INTEGER NOT NULL,
    `VideoID` INTEGER NULL,
    `SeriesID` INTEGER NULL,
    `Ordre` INTEGER NOT NULL DEFAULT 0,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_saga_video`(`SagaID`, `VideoID`),
    UNIQUE INDEX `uniq_saga_series`(`SagaID`, `SeriesID`),
    INDEX `idx_saga_content_order`(`SagaID`, `Ordre`),
    INDEX `SagaContent_VideoID_fkey`(`VideoID`),
    INDEX `SagaContent_SeriesID_fkey`(`SeriesID`),
    PRIMARY KEY (`SagaContentID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Saga` ADD CONSTRAINT `Saga_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat`(`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SagaContent` ADD CONSTRAINT `SagaContent_SagaID_fkey` FOREIGN KEY (`SagaID`) REFERENCES `Saga`(`SagaID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SagaContent` ADD CONSTRAINT `SagaContent_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SagaContent` ADD CONSTRAINT `SagaContent_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`) ON DELETE CASCADE ON UPDATE CASCADE;
