-- Personnages interprétés pour chaque lien personne/film ou personne/série.
CREATE TABLE `VideoPersonnage` (
    `VideoPersonnageID` INTEGER NOT NULL AUTO_INCREMENT,
    `VideoPersonneID` INTEGER NOT NULL,
    `Nom` VARCHAR(160) NOT NULL,
    `Position` INTEGER NOT NULL DEFAULT 0,
    UNIQUE INDEX `VideoPersonnage_VideoPersonneID_Nom_key` (`VideoPersonneID`, `Nom`),
    PRIMARY KEY (`VideoPersonnageID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SeriesPersonnage` (
    `SeriesPersonnageID` INTEGER NOT NULL AUTO_INCREMENT,
    `SeriesPersonneID` INTEGER NOT NULL,
    `Nom` VARCHAR(160) NOT NULL,
    `Position` INTEGER NOT NULL DEFAULT 0,
    UNIQUE INDEX `SeriesPersonnage_SeriesPersonneID_Nom_key` (`SeriesPersonneID`, `Nom`),
    PRIMARY KEY (`SeriesPersonnageID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VideoPersonnage` ADD CONSTRAINT `VideoPersonnage_VideoPersonneID_fkey`
    FOREIGN KEY (`VideoPersonneID`) REFERENCES `VideoPersonne`(`VideoPersonneID`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SeriesPersonnage` ADD CONSTRAINT `SeriesPersonnage_SeriesPersonneID_fkey`
    FOREIGN KEY (`SeriesPersonneID`) REFERENCES `SeriesPersonne`(`SeriesPersonneID`) ON DELETE CASCADE ON UPDATE CASCADE;
