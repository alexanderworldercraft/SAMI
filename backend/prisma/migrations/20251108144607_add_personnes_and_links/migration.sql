-- CreateTable
CREATE TABLE `Personne` (
    `PersonneID` INTEGER NOT NULL AUTO_INCREMENT,
    `Nom` VARCHAR(191) NOT NULL,
    `Prenom` VARCHAR(191) NOT NULL,
    `Surnom` VARCHAR(191) NULL,
    `CheminImage` VARCHAR(191) NULL,
    `ImageStatut` ENUM('DEFAULT', 'CUSTOM') NOT NULL DEFAULT 'DEFAULT',
    `CreateDate` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`PersonneID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoPersonne` (
    `VideoPersonneID` INTEGER NOT NULL AUTO_INCREMENT,
    `VideoID` INTEGER NOT NULL,
    `PersonneID` INTEGER NOT NULL,
    `EstActeur` BOOLEAN NOT NULL DEFAULT false,
    `EstRealisateur` BOOLEAN NOT NULL DEFAULT false,

    INDEX `VideoPersonne_PersonneID_idx`(`PersonneID`),
    INDEX `VideoPersonne_VideoID_idx`(`VideoID`),
    UNIQUE INDEX `VideoPersonne_VideoID_PersonneID_key`(`VideoID`, `PersonneID`),
    PRIMARY KEY (`VideoPersonneID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SeriesPersonne` (
    `SeriesPersonneID` INTEGER NOT NULL AUTO_INCREMENT,
    `SeriesID` INTEGER NOT NULL,
    `PersonneID` INTEGER NOT NULL,
    `EstActeur` BOOLEAN NOT NULL DEFAULT false,
    `EstRealisateur` BOOLEAN NOT NULL DEFAULT false,

    INDEX `SeriesPersonne_PersonneID_idx`(`PersonneID`),
    INDEX `SeriesPersonne_SeriesID_idx`(`SeriesID`),
    UNIQUE INDEX `SeriesPersonne_SeriesID_PersonneID_key`(`SeriesID`, `PersonneID`),
    PRIMARY KEY (`SeriesPersonneID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VideoPersonne` ADD CONSTRAINT `VideoPersonne_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoPersonne` ADD CONSTRAINT `VideoPersonne_PersonneID_fkey` FOREIGN KEY (`PersonneID`) REFERENCES `Personne`(`PersonneID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SeriesPersonne` ADD CONSTRAINT `SeriesPersonne_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SeriesPersonne` ADD CONSTRAINT `SeriesPersonne_PersonneID_fkey` FOREIGN KEY (`PersonneID`) REFERENCES `Personne`(`PersonneID`) ON DELETE RESTRICT ON UPDATE CASCADE;
