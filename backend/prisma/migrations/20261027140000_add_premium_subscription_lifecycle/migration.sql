ALTER TABLE `Utilisateur`
    ADD COLUMN `PremiumPlan` VARCHAR(10) NULL,
    ADD COLUMN `PremiumRenewalPlan` VARCHAR(10) NULL;

-- La date de fin acquise reste intacte. Reprendre la dernière formule connue,
-- sinon mensuelle. Seuls les abonnements encore actifs sont renouvelés.
UPDATE `Utilisateur` u
SET u.`PremiumPlan` = COALESCE((
    SELECT JSON_UNQUOTE(JSON_EXTRACT(l.`Meta`, '$.plan'))
    FROM `Log` l
    JOIN `Action` a ON a.`ActionID` = l.`ActionID`
    WHERE l.`UtilisateurID` = u.`UtilisateurID`
      AND a.`Nom` = 'premium_payment_fake'
      AND JSON_UNQUOTE(JSON_EXTRACT(l.`Meta`, '$.plan')) IN ('MONTHLY', 'YEARLY')
    ORDER BY l.`DateAction` DESC, l.`LogID` DESC
    LIMIT 1
), 'MONTHLY')
WHERE u.`PremiumEndDate` > CURRENT_TIMESTAMP(3);

UPDATE `Utilisateur`
SET `PremiumRenewalPlan` = `PremiumPlan`
WHERE `PremiumEndDate` > CURRENT_TIMESTAMP(3);

CREATE TABLE `PremiumPayment` (
    `PaymentID` VARCHAR(120) NOT NULL,
    `UtilisateurID` INTEGER NOT NULL,
    `Plan` VARCHAR(10) NOT NULL,
    `CreateDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `PremiumPayment_UtilisateurID_CreateDate_idx` (`UtilisateurID`, `CreateDate`),
    PRIMARY KEY (`PaymentID`),
    CONSTRAINT `PremiumPayment_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`)
        REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Utilisateur_PremiumRenewalPlan_PremiumEndDate_idx`
    ON `Utilisateur` (`PremiumRenewalPlan`, `PremiumEndDate`);
