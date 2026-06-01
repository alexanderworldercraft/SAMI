-- CreateTable
CREATE TABLE `UtilisateurGenre` (
    `UtilisateurGenreID` INTEGER NOT NULL AUTO_INCREMENT,
    `UtilisateurID` INTEGER NOT NULL,
    `GenreID` INTEGER NOT NULL,

    PRIMARY KEY (`UtilisateurGenreID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UtilisateurGenre` ADD CONSTRAINT `UtilisateurGenre_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur`(`UtilisateurID`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UtilisateurGenre` ADD CONSTRAINT `UtilisateurGenre_GenreID_fkey` FOREIGN KEY (`GenreID`) REFERENCES `Genre`(`GenreID`) ON DELETE RESTRICT ON UPDATE CASCADE;
