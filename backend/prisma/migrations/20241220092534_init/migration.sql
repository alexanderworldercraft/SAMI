-- CreateTable
CREATE TABLE `Etat` (
    `EtatID` INTEGER NOT NULL AUTO_INCREMENT,
    `Nom` VARCHAR(100) NOT NULL,

    PRIMARY KEY (`EtatID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Grade` (
    `GradeID` INTEGER NOT NULL AUTO_INCREMENT,
    `Nom` VARCHAR(50) NOT NULL,

    UNIQUE INDEX `Grade_Nom_key`(`Nom`),
    PRIMARY KEY (`GradeID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Genre` (
    `GenreID` INTEGER NOT NULL AUTO_INCREMENT,
    `Nom` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`GenreID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Series` (
    `SeriesID` INTEGER NOT NULL AUTO_INCREMENT,
    `Titre` VARCHAR(100) NOT NULL,
    `Resumer` TEXT NOT NULL,
    `CheminImage` VARCHAR(255) NOT NULL,
    `EtatID` INTEGER NOT NULL,

    PRIMARY KEY (`SeriesID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SeriesGenre` (
    `SeriesGenreID` INTEGER NOT NULL AUTO_INCREMENT,
    `SeriesID` INTEGER NOT NULL,
    `GenreID` INTEGER NOT NULL,

    PRIMARY KEY (`SeriesGenreID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Saison` (
    `SaisonID` INTEGER NOT NULL AUTO_INCREMENT,
    `Numero` INTEGER NOT NULL,
    `SeriesID` INTEGER NOT NULL,

    PRIMARY KEY (`SaisonID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Video` (
    `VideoID` INTEGER NOT NULL AUTO_INCREMENT,
    `Titre` VARCHAR(100) NOT NULL,
    `Resumer` TEXT NULL,
    `CheminAcces` VARCHAR(255) NOT NULL,
    `CheminImage` VARCHAR(255) NULL,
    `EtatID` INTEGER NOT NULL,
    `SaisonID` INTEGER NULL,

    PRIMARY KEY (`VideoID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoGenre` (
    `VideoGenreID` INTEGER NOT NULL AUTO_INCREMENT,
    `VideoID` INTEGER NOT NULL,
    `GenreID` INTEGER NOT NULL,

    PRIMARY KEY (`VideoGenreID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoSubtitle` (
    `VideoSubtitleID` INTEGER NOT NULL AUTO_INCREMENT,
    `Label` VARCHAR(100) NOT NULL,
    `CheminSubtitle` VARCHAR(255) NOT NULL,
    `VideoID` INTEGER NOT NULL,

    PRIMARY KEY (`VideoSubtitleID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Utilisateur` (
    `UtilisateurID` INTEGER NOT NULL AUTO_INCREMENT,
    `Surnom` VARCHAR(191) NOT NULL,
    `MotDePasse` VARCHAR(255) NOT NULL,
    `CheminImage` VARCHAR(255) NULL,
    `Email` VARCHAR(100) NOT NULL,
    `Salt` VARCHAR(255) NOT NULL,
    `GradeID` INTEGER NOT NULL,
    `EtatID` INTEGER NOT NULL,

    UNIQUE INDEX `Utilisateur_Surnom_key`(`Surnom`),
    INDEX `Utilisateur_GradeID_fkey`(`GradeID`),
    INDEX `Utilisateur_EtatID_fkey`(`EtatID`),
    PRIMARY KEY (`UtilisateurID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Series` ADD CONSTRAINT `Series_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat`(`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SeriesGenre` ADD CONSTRAINT `SeriesGenre_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SeriesGenre` ADD CONSTRAINT `SeriesGenre_GenreID_fkey` FOREIGN KEY (`GenreID`) REFERENCES `Genre`(`GenreID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Saison` ADD CONSTRAINT `Saison_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series`(`SeriesID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Video` ADD CONSTRAINT `Video_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat`(`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Video` ADD CONSTRAINT `Video_SaisonID_fkey` FOREIGN KEY (`SaisonID`) REFERENCES `Saison`(`SaisonID`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoGenre` ADD CONSTRAINT `VideoGenre_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoGenre` ADD CONSTRAINT `VideoGenre_GenreID_fkey` FOREIGN KEY (`GenreID`) REFERENCES `Genre`(`GenreID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoSubtitle` ADD CONSTRAINT `VideoSubtitle_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video`(`VideoID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Utilisateur` ADD CONSTRAINT `Utilisateur_GradeID_fkey` FOREIGN KEY (`GradeID`) REFERENCES `Grade`(`GradeID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Utilisateur` ADD CONSTRAINT `Utilisateur_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat`(`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE;
