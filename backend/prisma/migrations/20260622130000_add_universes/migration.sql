-- CreateTable
CREATE TABLE `Universe` (
    `UniverseID` INTEGER NOT NULL AUTO_INCREMENT,
    `Titre` VARCHAR(100) NOT NULL,
    `Resume` TEXT NULL,
    `EtatID` INTEGER NOT NULL,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Universe_EtatID_fkey`(`EtatID`),
    PRIMARY KEY (`UniverseID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UniverseSaga` (
    `UniverseSagaID` INTEGER NOT NULL AUTO_INCREMENT,
    `UniverseID` INTEGER NOT NULL,
    `SagaID` INTEGER NOT NULL,
    `Ordre` INTEGER NOT NULL DEFAULT 0,
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_universe_saga`(`UniverseID`, `SagaID`),
    INDEX `idx_universe_saga_order`(`UniverseID`, `Ordre`),
    INDEX `UniverseSaga_SagaID_fkey`(`SagaID`),
    PRIMARY KEY (`UniverseSagaID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Universe` ADD CONSTRAINT `Universe_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat`(`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UniverseSaga` ADD CONSTRAINT `UniverseSaga_UniverseID_fkey` FOREIGN KEY (`UniverseID`) REFERENCES `Universe`(`UniverseID`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UniverseSaga` ADD CONSTRAINT `UniverseSaga_SagaID_fkey` FOREIGN KEY (`SagaID`) REFERENCES `Saga`(`SagaID`) ON DELETE CASCADE ON UPDATE CASCADE;
