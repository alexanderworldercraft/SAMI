CREATE TABLE `PersonDuplicateReview` (
    `PersonDuplicateReviewID` INTEGER NOT NULL AUTO_INCREMENT,
    `PersonneAID` INTEGER NOT NULL,
    `PersonneBID` INTEGER NOT NULL,
    `Decision` ENUM('DOUBT', 'DISTINCT', 'MERGED') NOT NULL,
    `MergedPersonneID` INTEGER NULL,
    `ReviewedByID` INTEGER NOT NULL,
    `CreateDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `UpdateDate` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uniq_person_duplicate_pair`(`PersonneAID`, `PersonneBID`),
    INDEX `idx_person_duplicate_decision`(`Decision`),
    INDEX `idx_person_duplicate_reviewer`(`ReviewedByID`),
    PRIMARY KEY (`PersonDuplicateReviewID`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PersonDuplicateReview`
    ADD CONSTRAINT `PersonDuplicateReview_PersonneAID_fkey`
    FOREIGN KEY (`PersonneAID`) REFERENCES `Personne`(`PersonneID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `PersonDuplicateReview_PersonneBID_fkey`
    FOREIGN KEY (`PersonneBID`) REFERENCES `Personne`(`PersonneID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `PersonDuplicateReview_ReviewedByID_fkey`
    FOREIGN KEY (`ReviewedByID`) REFERENCES `Utilisateur`(`UtilisateurID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
