-- MySQL dump 10.13  Distrib 9.5.0, for macos15.7 (arm64)
--
-- Host: localhost    Database: SamiDB
-- ------------------------------------------------------
-- Server version	9.5.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '5b97935a-c95e-11f0-ab14-3a34581b8135:1-2755';

--
-- Table structure for table `_prisma_migrations`
--

DROP TABLE IF EXISTS `_prisma_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_prisma_migrations` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `checksum` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `finished_at` datetime(3) DEFAULT NULL,
  `migration_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `logs` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `rolled_back_at` datetime(3) DEFAULT NULL,
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `_prisma_migrations`
--

LOCK TABLES `_prisma_migrations` WRITE;
/*!40000 ALTER TABLE `_prisma_migrations` DISABLE KEYS */;
INSERT INTO `_prisma_migrations` VALUES ('028e41c1-a36a-47e5-813d-e571d53a19a9','af4bf8f82971eb84c5e22174f03228a754422100ea65b212642cf2d2a17cfe8d','2026-05-18 13:36:53.068','20260518120000_add_user_video_progress',NULL,NULL,'2026-05-18 13:36:53.013',1),('02cfb706-b963-40e2-b5a0-897f23169894','ccfa1e3540b3669417713e9ddcd80604db350b7c1128df359ba852a55b0ab498','2026-05-18 15:00:15.625','20260518130000_add_user_series_watch_reset',NULL,NULL,'2026-05-18 15:00:15.578',1),('08f9dccd-fdd2-47f4-b032-9402f2b862de','4ced9e71904c4fd3efa5181ba3c3e7ea9ff163c5962012e8de6ee230025d249f','2026-05-13 18:46:30.245','20251205173652_add_all_create_date',NULL,NULL,'2026-05-13 18:46:30.203',1),('13cfdebe-7c9f-4a24-9edd-d66b7c933dc0','6896ef34e7fb03bb63cbd23d438604b068681b0432fa08f7ea10f0cb18a8a842','2026-05-13 18:46:30.148','20250706055933_init',NULL,NULL,'2026-05-13 18:46:30.137',1),('25fe9638-c990-48cf-97f1-87897dea8471','676e8cb08d3993bda46769b3987898cd3abee0ac1bceaa8adc85f79b3fb4e6e5','2026-06-15 16:32:56.886','20260615120000_add_homepage_default_genres',NULL,NULL,'2026-06-15 16:32:56.856',1),('4131a215-5725-4225-a4f5-150e35868ebc','ef66219f73576a8fd45d6679a5be0158d6103caced6a0c792571a3dfa8cbf650','2026-05-13 18:46:30.174','20251124180320_init',NULL,NULL,'2026-05-13 18:46:30.171',1),('4deb27bc-6c79-4688-93d7-a0450ced079e','e4ce3a6af4b09ac74539145a907369181064bfe92626bf3a985ff7dd5a45ac2d','2026-06-08 08:50:59.796','20260608120000_add_unique_seed_names',NULL,NULL,'2026-06-08 08:50:59.708',1),('5d35cf65-99f4-4a42-8f10-442e83485099','f31330f5ddad9b535533f91fdf72947284ac49e4d066405d74f687aa5bd9909f','2026-05-13 18:46:30.137','20250405071922_add_optional_foreign_key_create_utilisateur_genre',NULL,NULL,'2026-05-13 18:46:30.126',1),('604832a6-18a0-45f0-a48f-0cb56d05e128','05c1c97dd4572bc0f7d4d0e69b0dbd886a9b1d0549d7ed592b9c2f9acbc7efa5','2026-05-13 18:46:30.181','20251130163534_add_create_lastlogin_utilisateur',NULL,NULL,'2026-05-13 18:46:30.175',1),('6079cc44-7812-4375-8a9d-0469f5de7fe2','a72609c09523aa1e1af84e65ccddf039de1c3e7660eb9bc1480e7015ac547dca','2026-05-13 18:46:30.126','20250330075234_add_optional_foreign_key_create_saison',NULL,NULL,'2026-05-13 18:46:30.117',1),('749ae327-35e0-4d7e-bd77-0c9a344f86c9','06b7456cf4153ba01e7e5956591a63af97df047f7af3d93f9ea75d6a7c3f8c40','2026-06-04 08:30:36.868','20260604120000_add_admin_message',NULL,NULL,'2026-06-04 08:30:36.856',1),('7680b2ee-3bb8-42eb-826a-915497611264','7cb9ee76aab707aacbc2e17c2a5e61a824d584bd2a3a2731b1a89d432cd5acb6','2026-05-20 13:53:04.801','20260520090000_add_genre_featured_content',NULL,NULL,'2026-05-20 13:53:04.738',1),('8383b1f2-670f-47e6-978b-40d1c220bb21','69c922953426e6ebc986d3535e8a4987277d24a6bac72546999de56a10b90d42','2026-06-18 17:16:59.120','20260618120000_add_manual_database_backup_action',NULL,NULL,'2026-06-18 17:16:59.111',1),('86dbdb9d-c1e7-454e-bbec-3a80c6569225','28823c7610bbdf14a58b067b51168f0c50717465c053f32c6f38d070bd14a88b','2026-05-13 18:46:30.117','20250330074707_add_optional_foreign_key_create_serie',NULL,NULL,'2026-05-13 18:46:30.106',1),('ac82a5b0-b3ba-4787-8795-fc1f76ce46e4','c21e41c02809cf115e77ac6263397897ed744f86d7fe71632796f52f3ed18de7','2026-05-13 18:46:30.171','20251108144607_add_personnes_and_links',NULL,NULL,'2026-05-13 18:46:30.149',1),('c5f58f07-a910-4fdd-821d-ca807f48f2e7','ce6157bcbb58dcd61c4e5de560a57438cd2f0342d8b8e33e044a198994110bb9','2026-05-13 18:46:30.105','20250330071441_add_optional_foreign_key_create_video',NULL,NULL,'2026-05-13 18:46:30.092',1),('c81b4774-1c57-4bb4-b3a4-efbd3fd9ce4a','903bf7704f8996cdac5841caeb20343426d5ea3ef9c6957cc8830a5fef542f4a','2026-05-13 18:46:30.194','20251205165341_add_premium',NULL,NULL,'2026-05-13 18:46:30.181',1),('e12ce94a-68e4-4f78-b6c9-9e51695453b5','c8b86f7bf13f4bf657ce198a02a844b7a774210957e0d508f00f434269beef56','2026-05-13 18:46:30.203','20251205171745_add_premium_fix',NULL,NULL,'2026-05-13 18:46:30.195',1),('ead6148a-2823-468f-8689-c56d874a82dd','1b591f846d9748f13053c69f09bd97d32c18231bbe615ee3229a9c793d8ddc48','2026-05-13 18:46:30.091','20241220092534_init',NULL,NULL,'2026-05-13 18:46:29.965',1);
/*!40000 ALTER TABLE `_prisma_migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Action`
--

DROP TABLE IF EXISTS `Action`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Action` (
  `ActionID` int NOT NULL AUTO_INCREMENT,
  `Nom` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Description` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Criticite` int DEFAULT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ActionID`),
  UNIQUE KEY `Action_Nom_key` (`Nom`)
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Action`
--

LOCK TABLES `Action` WRITE;
/*!40000 ALTER TABLE `Action` DISABLE KEYS */;
INSERT INTO `Action` VALUES (1,'connexion','Connexion d\'un utilisateur.',1,'2026-05-13 18:46:36.162'),(2,'deconnexion','Déconnexion d\'un utilisateur.',1,'2026-05-13 18:46:36.162'),(3,'reset_mot_de_passe','Réinitialisation du mot de passe via la fonctionnalité \"Mot de passe oublié\".',2,'2026-05-13 18:46:36.162'),(4,'reset_mot_de_passe_echec','Tentative de réinitialisation de mot de passe avec combinaison surnom/email invalide.',3,'2026-05-13 18:46:36.162'),(5,'connexion_echec','Tentative de connexion avec mot de passe incorrect.',2,'2026-05-13 18:46:36.162'),(6,'login_lock','Blocage temporaire des tentatives de connexion après plusieurs échecs.',3,'2026-05-13 18:46:36.162'),(7,'update_parametres','Maj des paramètres.',1,'2026-05-13 18:46:36.162'),(8,'update_parametres_echec','Tentative de MAJ des paramètres avec mot de passe incorrect.',2,'2026-05-13 18:46:36.162'),(9,'update_parametres_lock','Blocage temporaire des tentatives de connexion après plusieurs échecs des MAJ des paramètres.',3,'2026-05-13 18:46:36.162'),(10,'delete_account','Supression du compte.',1,'2026-05-13 18:46:36.162'),(11,'delete_account_echec','Tentative de supression du compte avec mot de passe incorrect.',2,'2026-05-13 18:46:36.162'),(12,'delete_account_lock','Blocage temporaire des tentatives de connexion après plusieurs échecs de supression du compte.',3,'2026-05-13 18:46:36.162'),(13,'video_update','Utilisateur MAJ X vidéo.',1,'2026-05-18 14:03:49.972'),(14,'serie_update','Utilisateur MAJ X série.',1,'2026-05-18 14:03:49.972'),(15,'video_first_play','Utilisateur regarde X vidéo.',0,'2026-05-18 14:03:49.972'),(29,'video_resume_play','Utilisateur reprend X vidéo depuis une progression enregistrée.',0,'2026-06-02 07:58:04.280'),(46,'admin_message_update','Maj du message général administrateur.',1,'2026-06-04 10:30:36.863'),(47,'admin_message_toggle','Changement d\'état du toggle du message général administrateur.',1,'2026-06-04 10:30:36.863'),(49,'video_delete','Utilisateur supprime X vidéo.',2,'2026-06-13 06:28:51.950'),(50,'video_soft_delete','Utilisateur place X vidéo dans la corbeille.',2,'2026-06-13 06:28:51.950'),(51,'video_restore','Super administrateur restaure X vidéo.',2,'2026-06-13 06:28:51.950'),(52,'serie_delete','Utilisateur supprime X série.',2,'2026-06-13 06:28:51.950'),(53,'saison_update','Utilisateur MAJ X saison.',1,'2026-06-13 06:28:51.950'),(54,'saison_delete','Utilisateur supprime X saison.',2,'2026-06-13 06:28:51.950'),(56,'manual_database_backup','Super administrateur lance une sauvegarde manuelle de la base de données.',3,'2026-06-18 19:16:59.113');
/*!40000 ALTER TABLE `Action` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AdminMessage`
--

DROP TABLE IF EXISTS `AdminMessage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AdminMessage` (
  `AdminMessageID` bigint NOT NULL AUTO_INCREMENT,
  `Titre` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Actif` tinyint(1) NOT NULL DEFAULT '0',
  `UpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`AdminMessageID`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AdminMessage`
--

LOCK TABLES `AdminMessage` WRITE;
/*!40000 ALTER TABLE `AdminMessage` DISABLE KEYS */;
INSERT INTO `AdminMessage` VALUES (1,'Test titre','test description.',0,'2026-06-04 08:32:54.082','2026-06-04 08:31:39.583');
/*!40000 ALTER TABLE `AdminMessage` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Etat`
--

DROP TABLE IF EXISTS `Etat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Etat` (
  `EtatID` int NOT NULL AUTO_INCREMENT,
  `Nom` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`EtatID`),
  UNIQUE KEY `Etat_Nom_key` (`Nom`)
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Etat`
--

LOCK TABLES `Etat` WRITE;
/*!40000 ALTER TABLE `Etat` DISABLE KEYS */;
INSERT INTO `Etat` VALUES (1,'Actif','2026-05-13 18:46:36.161'),(2,'Supprimer','2026-05-13 18:46:36.161'),(3,'Bloquer','2026-05-13 18:46:36.161'),(4,'Vendu','2026-05-13 18:46:36.161');
/*!40000 ALTER TABLE `Etat` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Genre`
--

DROP TABLE IF EXISTS `Genre`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Genre` (
  `GenreID` int NOT NULL AUTO_INCREMENT,
  `Nom` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`GenreID`),
  UNIQUE KEY `Genre_Nom_key` (`Nom`)
) ENGINE=InnoDB AUTO_INCREMENT=361 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Genre`
--

LOCK TABLES `Genre` WRITE;
/*!40000 ALTER TABLE `Genre` DISABLE KEYS */;
INSERT INTO `Genre` VALUES (1,'Action','2026-05-13 18:46:36.164'),(2,'Animations','2026-05-13 18:46:36.164'),(3,'Aventure','2026-05-13 18:46:36.164'),(4,'Biographie','2026-05-13 18:46:36.164'),(5,'Buddy cop','2026-05-13 18:46:36.164'),(7,'Comédie','2026-05-13 18:46:36.164'),(8,'Court-métrage','2026-05-13 18:46:36.164'),(9,'Cyberpunk','2026-05-13 18:46:36.164'),(10,'Documentaire','2026-05-13 18:46:36.164'),(11,'Drame','2026-05-13 18:46:36.164'),(12,'Dystopique','2026-05-13 18:46:36.164'),(13,'Épique','2026-05-13 18:46:36.164'),(14,'Épouvante','2026-05-13 18:46:36.164'),(15,'Espionnage','2026-05-13 18:46:36.164'),(16,'Expérimental','2026-05-13 18:46:36.164'),(17,'Fantastique','2026-05-13 18:46:36.164'),(18,'Fantasy','2026-05-13 18:46:36.164'),(19,'Film culte','2026-05-13 18:46:36.164'),(20,'Film noir','2026-05-13 18:46:36.164'),(21,'Films','2026-05-13 18:46:36.164'),(22,'Guerre','2026-05-13 18:46:36.164'),(23,'Historique','2026-05-13 18:46:36.164'),(24,'Horreur','2026-05-13 18:46:36.164'),(26,'Isekai','2026-05-13 18:46:36.164'),(27,'Mélo (Mélodrame)','2026-05-13 18:46:36.164'),(28,'Mockumentaire (faux documentaire)','2026-05-13 18:46:36.164'),(29,'Musical','2026-05-13 18:46:36.164'),(30,'Mystère','2026-05-13 18:46:36.164'),(31,'Parodie','2026-05-13 18:46:36.164'),(32,'Policier','2026-05-13 18:46:36.164'),(33,'Post-apocalyptique','2026-05-13 18:46:36.164'),(34,'Psychologique','2026-05-13 18:46:36.164'),(35,'Road movie','2026-05-13 18:46:36.164'),(36,'Romance','2026-05-13 18:46:36.164'),(37,'Science-fiction','2026-05-13 18:46:36.164'),(38,'Séries','2026-05-13 18:46:36.164'),(39,'Shōnen','2026-05-13 18:46:36.164'),(40,'Slasher','2026-05-13 18:46:36.164'),(41,'Space opera','2026-05-13 18:46:36.164'),(42,'Steampunk','2026-05-13 18:46:36.164'),(43,'Super-héros','2026-05-13 18:46:36.164'),(44,'Surnaturel','2026-05-13 18:46:36.164'),(45,'Survival','2026-05-13 18:46:36.164'),(46,'Suspense','2026-05-13 18:46:36.164'),(47,'Thriller','2026-05-13 18:46:36.164'),(48,'Tranche de vie','2026-05-13 18:46:36.164'),(49,'Uchronie','2026-05-13 18:46:36.164'),(50,'Western','2026-05-13 18:46:36.164'),(51,'YouTube','2026-05-13 18:46:36.164'),(307,'Catastrophe','2026-06-08 08:56:34.597'),(308,'IA','2026-06-08 08:57:44.128');
/*!40000 ALTER TABLE `Genre` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `GenreFeaturedContent`
--

DROP TABLE IF EXISTS `GenreFeaturedContent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `GenreFeaturedContent` (
  `GenreFeaturedContentID` bigint NOT NULL AUTO_INCREMENT,
  `GenreID` int NOT NULL,
  `VideoID` int DEFAULT NULL,
  `SeriesID` int DEFAULT NULL,
  `ContentKey` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `PreviousContentKey` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `CandidateCount` int NOT NULL DEFAULT '0',
  `ActiveFrom` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `UpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`GenreFeaturedContentID`),
  UNIQUE KEY `GenreFeaturedContent_GenreID_key` (`GenreID`),
  KEY `idx_genre_featured_video` (`VideoID`),
  KEY `idx_genre_featured_series` (`SeriesID`),
  KEY `idx_genre_featured_content_key` (`ContentKey`),
  CONSTRAINT `GenreFeaturedContent_GenreID_fkey` FOREIGN KEY (`GenreID`) REFERENCES `Genre` (`GenreID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `GenreFeaturedContent_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series` (`SeriesID`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `GenreFeaturedContent_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video` (`VideoID`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=154 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `GenreFeaturedContent`
--

LOCK TABLES `GenreFeaturedContent` WRITE;
/*!40000 ALTER TABLE `GenreFeaturedContent` DISABLE KEYS */;
INSERT INTO `GenreFeaturedContent` VALUES (1,1,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(4,2,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(9,4,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(12,5,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(18,7,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(21,8,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(24,9,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(27,10,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(30,11,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(33,12,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(38,14,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(41,15,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(44,16,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(47,17,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(50,18,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(53,19,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(56,20,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(59,21,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(62,22,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(65,23,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(68,24,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(74,26,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(77,27,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(80,28,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(83,29,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(86,30,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(89,31,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(92,32,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(95,33,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(98,34,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(101,35,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(108,38,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(111,39,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(114,40,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(117,41,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(120,42,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(123,43,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(126,44,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(129,45,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(132,46,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(135,47,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(138,48,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(141,49,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(144,50,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(147,51,NULL,NULL,NULL,NULL,0,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(150,3,NULL,NULL,'video:4','video:8',2,'2026-05-20 13:56:22.491','2026-06-13 06:21:37.730','2026-05-20 13:53:25.422'),(151,13,NULL,1,'series:1',NULL,1,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(152,36,6,NULL,'video:6',NULL,1,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422'),(153,37,NULL,NULL,NULL,NULL,2,'2026-05-20 13:56:22.491','2026-05-20 13:56:22.503','2026-05-20 13:53:25.422');
/*!40000 ALTER TABLE `GenreFeaturedContent` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Grade`
--

DROP TABLE IF EXISTS `Grade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Grade` (
  `GradeID` int NOT NULL AUTO_INCREMENT,
  `Nom` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`GradeID`),
  UNIQUE KEY `Grade_Nom_key` (`Nom`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Grade`
--

LOCK TABLES `Grade` WRITE;
/*!40000 ALTER TABLE `Grade` DISABLE KEYS */;
INSERT INTO `Grade` VALUES (1,'SuperAdmin','2026-05-13 18:46:36.159'),(2,'Admin','2026-05-13 18:46:36.159'),(3,'Utilisateur','2026-05-13 18:46:36.159');
/*!40000 ALTER TABLE `Grade` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `HomepageDefaultGenre`
--

DROP TABLE IF EXISTS `HomepageDefaultGenre`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `HomepageDefaultGenre` (
  `HomepageDefaultGenreID` bigint NOT NULL AUTO_INCREMENT,
  `Position` int NOT NULL,
  `GenreID` int NOT NULL,
  `UpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`HomepageDefaultGenreID`),
  UNIQUE KEY `HomepageDefaultGenre_Position_key` (`Position`),
  KEY `idx_homepage_default_genre` (`GenreID`),
  CONSTRAINT `HomepageDefaultGenre_GenreID_fkey` FOREIGN KEY (`GenreID`) REFERENCES `Genre` (`GenreID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `HomepageDefaultGenre`
--

LOCK TABLES `HomepageDefaultGenre` WRITE;
/*!40000 ALTER TABLE `HomepageDefaultGenre` DISABLE KEYS */;
INSERT INTO `HomepageDefaultGenre` VALUES (1,1,5,'2026-06-15 16:45:04.864','2026-06-15 16:34:57.665'),(2,2,308,'2026-06-15 16:45:04.864','2026-06-15 16:34:57.665'),(3,3,12,'2026-06-15 16:45:04.864','2026-06-15 16:34:57.665'),(4,4,10,'2026-06-15 16:45:04.864','2026-06-15 16:34:57.665'),(5,5,307,'2026-06-15 16:45:04.864','2026-06-15 16:34:57.665');
/*!40000 ALTER TABLE `HomepageDefaultGenre` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Log`
--

DROP TABLE IF EXISTS `Log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Log` (
  `LogID` bigint NOT NULL AUTO_INCREMENT,
  `UtilisateurID` int NOT NULL,
  `ActionID` int NOT NULL,
  `DateAction` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `AncienneValeur` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `Champ` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Meta` json DEFAULT NULL,
  `NouvelleValeur` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `SaisonID` int DEFAULT NULL,
  `SeriesID` int DEFAULT NULL,
  `UserAgent` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `VideoID` int DEFAULT NULL,
  PRIMARY KEY (`LogID`),
  KEY `idx_log_action_date` (`ActionID`,`DateAction`),
  KEY `idx_log_saison_date` (`SaisonID`,`DateAction`),
  KEY `idx_log_series_date` (`SeriesID`,`DateAction`),
  KEY `idx_log_user_date` (`UtilisateurID`,`DateAction`),
  KEY `idx_log_video_date` (`VideoID`,`DateAction`),
  CONSTRAINT `fk_log_saison` FOREIGN KEY (`SaisonID`) REFERENCES `Saison` (`SaisonID`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_series` FOREIGN KEY (`SeriesID`) REFERENCES `Series` (`SeriesID`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_log_video` FOREIGN KEY (`VideoID`) REFERENCES `Video` (`VideoID`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Log_ActionID_fkey` FOREIGN KEY (`ActionID`) REFERENCES `Action` (`ActionID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Log_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=86 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Log`
--

LOCK TABLES `Log` WRITE;
/*!40000 ALTER TABLE `Log` DISABLE KEYS */;
INSERT INTO `Log` VALUES (4,1,15,'2026-05-18 14:08:37.516','2026-05-18 14:08:37.516',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-18T14:08:37.513Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(5,1,15,'2026-05-18 14:08:46.564','2026-05-18 14:08:46.564',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-18T14:08:46.562Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(6,1,15,'2026-05-18 14:09:01.117','2026-05-18 14:09:01.117','test de film avec nouvelle reprise','player','192.168.50.177','{\"deletedAt\": \"2026-06-13T06:23:15.786Z\", \"serverTime\": \"2026-05-18T14:09:01.112Z\", \"deletedVideoId\": 4, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"test de film avec nouvelle reprise\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(8,1,2,'2026-05-18 14:44:05.449','2026-05-18 14:44:05.449',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(9,1,1,'2026-05-18 14:45:52.067','2026-05-18 14:45:52.067',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(10,1,15,'2026-05-18 15:01:13.775','2026-05-18 15:01:13.775',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-18T15:01:13.770Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(11,1,14,'2026-05-18 15:01:35.121','2026-05-18 15:01:35.121','uploads/images/default.png','CheminImage','192.168.50.177',NULL,'uploads/serie/1/1779116495112_47m2wn.webp',NULL,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(12,1,15,'2026-05-18 15:05:39.273','2026-05-18 15:05:39.273','test de film avec nouvelle reprise','player','192.168.50.177','{\"deletedAt\": \"2026-06-13T06:23:15.786Z\", \"serverTime\": \"2026-05-18T15:05:39.268Z\", \"deletedVideoId\": 4, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"test de film avec nouvelle reprise\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(13,1,1,'2026-05-19 15:28:12.165','2026-05-19 15:28:12.165',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(14,1,15,'2026-05-19 15:28:44.536','2026-05-19 15:28:44.536',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-19T15:28:44.532Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(15,1,15,'2026-05-19 15:28:52.174','2026-05-19 15:28:52.174',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-19T15:28:52.171Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(16,1,15,'2026-05-19 15:29:09.005','2026-05-19 15:29:09.005',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-19T15:29:09.001Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(17,1,15,'2026-05-19 15:29:29.344','2026-05-19 15:29:29.344',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-19T15:29:29.341Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',2),(18,1,15,'2026-05-19 15:29:38.407','2026-05-19 15:29:38.407',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-19T15:29:38.404Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',3),(19,1,15,'2026-05-19 15:29:41.810','2026-05-19 15:29:41.810',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-19T15:29:41.808Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(20,1,15,'2026-05-19 15:36:12.877','2026-05-19 15:36:12.877',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-19T15:36:12.873Z\"}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',5),(21,1,15,'2026-05-19 15:36:16.684','2026-05-19 15:36:16.684','test 5','player','192.168.50.177','{\"deletedAt\": \"2026-06-15T15:27:00.231Z\", \"serverTime\": \"2026-05-19T15:36:16.681Z\", \"deletedVideoId\": 7, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"test 5\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(22,1,15,'2026-05-19 15:36:23.143','2026-05-19 15:36:23.143',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-19T15:36:23.134Z\"}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',6),(23,1,14,'2026-05-19 15:39:45.517','2026-05-19 15:39:45.517','false','Premium','192.168.50.177',NULL,'true',NULL,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(24,1,14,'2026-05-19 15:40:31.729','2026-05-19 15:40:31.729','','Resumer','192.168.50.177',NULL,'Entre Magny-en-Vexin et Gisors, à moins d\'une heure de Paris, au coeur d\'un environnement vallonné préservé, cette remarquable propriété à vendre de 35 hectares séduit par son calme absolu et ses vues à 360°. Dominant le paysage, la maison principale d\'environ 1.000 m², construite dans les années 70 et entièrement réhabilitée (désamiantage, isolation, huisseries, façades, réseaux, chauffage, piscine), offre aujourd\'hui une structure saine et moderne. Entièrement décloisonnée, elle constitue une page blanche à aménager selon vos envies. Un projet d\'architecte propose de vastes pièces de réception, plusieurs suites, une bibliothèque, un bureau, ainsi qu\'un espace bien-être. En sous-sol : buanderie, cave à vin et garages. Le domaine, alternant bois et prairies, comprend également un parc d\'accrobranche neuf. Un lieu d\'exception à l\'abri de toute nuisance, idéal pour un projet de prestige.',NULL,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(26,1,1,'2026-05-20 13:36:46.641','2026-05-20 13:36:46.641',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(27,1,13,'2026-05-20 13:51:01.866','2026-05-20 13:51:01.866','[]','GenreIDs','192.168.50.177','{\"added\": [36], \"removed\": []}','[36]',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',6),(28,1,14,'2026-05-20 13:51:23.205','2026-05-20 13:51:23.205','[]','GenreIDs','192.168.50.177','{\"added\": [13], \"removed\": []}','[13]',NULL,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(30,1,13,'2026-05-20 13:55:50.812','2026-05-20 13:55:50.812','[37]','GenreIDs','192.168.50.177','{\"added\": [3], \"removed\": [], \"deletedAt\": \"2026-06-15T15:35:42.294Z\", \"deletedVideoId\": 8, \"deletedSaisonId\": 2, \"deletedSeriesId\": 2, \"deletedVideoTitle\": \"test6\", \"deletedSeriesTitre\": \"test série 2\", \"deletedSaisonNumero\": 1, \"previousAncienneValeur\": \"[37]\"}','[37,3]',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(31,1,1,'2026-05-20 19:11:58.437','2026-05-20 19:11:58.437',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(32,1,15,'2026-05-20 19:12:12.037','2026-05-20 19:12:12.037',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-20T19:12:12.034Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(33,1,15,'2026-05-20 19:12:56.444','2026-05-20 19:12:56.444',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-20T19:12:56.440Z\"}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',6),(34,1,5,'2026-05-22 19:53:02.615','2026-05-22 19:53:02.615',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(35,1,1,'2026-05-22 19:53:18.662','2026-05-22 19:53:18.662',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(36,1,14,'2026-05-22 20:00:09.236','2026-05-22 20:00:09.236','uploads/images/default.png','CheminImage','192.168.50.177',NULL,'uploads/serie/2/1779480009225_wokvwj.webp',NULL,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(37,1,15,'2026-05-22 20:00:16.179','2026-05-22 20:00:16.179',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-22T20:00:16.169Z\"}','play',2,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',5),(38,1,15,'2026-05-22 20:00:30.745','2026-05-22 20:00:30.745',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-22T20:00:30.743Z\"}','play',2,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',5),(39,1,15,'2026-05-22 20:00:47.064','2026-05-22 20:00:47.064',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-22T20:00:47.062Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',1),(40,1,15,'2026-05-22 20:01:02.508','2026-05-22 20:01:02.508',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-22T20:01:02.505Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',2),(41,1,15,'2026-05-22 20:01:08.125','2026-05-22 20:01:08.125',NULL,'player','192.168.50.177','{\"serverTime\": \"2026-05-22T20:01:08.123Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',3),(42,1,15,'2026-05-22 20:01:35.968','2026-05-22 20:01:35.968','test de film avec nouvelle reprise','player','192.168.50.177','{\"deletedAt\": \"2026-06-13T06:23:15.786Z\", \"serverTime\": \"2026-05-22T20:01:35.966Z\", \"deletedVideoId\": 4, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"test de film avec nouvelle reprise\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',NULL),(43,1,1,'2026-06-02 07:37:37.872','2026-06-02 07:37:37.872',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(44,1,15,'2026-06-02 08:06:22.866','2026-06-02 08:06:22.866',NULL,'player','192.168.50.177','{\"duration\": 249, \"endPercent\": 100, \"serverTime\": \"2026-06-02T08:06:22.860Z\", \"endTimecode\": 249, \"startPercent\": 0, \"progressFinal\": true, \"startTimecode\": 0, \"progressUpdatedAt\": \"2026-06-02T08:14:04.788Z\"}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',6),(45,1,29,'2026-06-02 08:08:18.250','2026-06-02 08:08:18.250',NULL,'player','192.168.50.177','{\"duration\": 249, \"endPercent\": 16.06, \"serverTime\": \"2026-06-02T08:08:18.247Z\", \"endTimecode\": 40, \"startPercent\": 7.63, \"progressFinal\": false, \"startTimecode\": 19, \"progressUpdatedAt\": \"2026-06-02T08:08:40.935Z\"}','resume',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',6),(46,1,29,'2026-06-02 08:09:14.483','2026-06-02 08:09:14.483',NULL,'player','192.168.50.177','{\"duration\": 249, \"endPercent\": 8.03, \"serverTime\": \"2026-06-02T08:09:14.480Z\", \"endTimecode\": 20, \"startPercent\": 16.06, \"progressFinal\": false, \"startTimecode\": 40, \"progressUpdatedAt\": \"2026-06-02T08:14:29.548Z\"}','resume',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',6),(47,1,15,'2026-06-02 08:14:09.048','2026-06-02 08:14:09.048',NULL,'player','192.168.50.177','{\"duration\": 249, \"endPercent\": 8.03, \"serverTime\": \"2026-06-02T08:14:09.045Z\", \"endTimecode\": 20, \"startPercent\": 0, \"progressFinal\": false, \"startTimecode\": 0, \"progressUpdatedAt\": \"2026-06-02T08:14:29.547Z\"}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',6),(48,1,15,'2026-06-02 08:25:06.460','2026-06-02 08:25:06.460','test de film avec nouvelle reprise','player','192.168.50.177','{\"duration\": 1429, \"deletedAt\": \"2026-06-13T06:23:15.786Z\", \"endPercent\": 0.7, \"serverTime\": \"2026-06-02T08:25:06.456Z\", \"endTimecode\": 10, \"startPercent\": 0, \"progressFinal\": false, \"startTimecode\": 0, \"deletedVideoId\": 4, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"test de film avec nouvelle reprise\", \"progressUpdatedAt\": \"2026-06-02T08:25:16.717Z\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(49,1,29,'2026-06-02 08:25:45.616','2026-06-02 08:25:45.616','test de film avec nouvelle reprise','player','192.168.50.177','{\"duration\": 1429, \"deletedAt\": \"2026-06-13T06:23:15.786Z\", \"endPercent\": 1.4, \"serverTime\": \"2026-06-02T08:25:45.612Z\", \"endTimecode\": 20, \"startPercent\": 0.7, \"progressFinal\": false, \"startTimecode\": 10, \"deletedVideoId\": 4, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"test de film avec nouvelle reprise\", \"progressUpdatedAt\": \"2026-06-02T08:25:57.102Z\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null}','resume',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(50,1,15,'2026-06-02 08:26:13.913','2026-06-02 08:26:13.913',NULL,'player','192.168.50.177','{\"duration\": 249, \"endPercent\": 5.62, \"serverTime\": \"2026-06-02T08:26:13.910Z\", \"endTimecode\": 14, \"startPercent\": 0, \"progressFinal\": false, \"startTimecode\": 0, \"progressUpdatedAt\": \"2026-06-02T08:26:28.483Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1),(51,1,29,'2026-06-02 08:26:40.648','2026-06-02 08:26:40.648',NULL,'player','192.168.50.177','{\"duration\": 249, \"endPercent\": 10.84, \"serverTime\": \"2026-06-02T08:26:40.645Z\", \"endTimecode\": 27, \"startPercent\": 5.62, \"progressFinal\": false, \"startTimecode\": 14, \"progressUpdatedAt\": \"2026-06-02T08:26:55.375Z\"}','resume',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1),(52,1,15,'2026-06-02 08:27:20.715','2026-06-02 08:27:20.715',NULL,'player','192.168.50.177','{\"duration\": 249, \"endPercent\": 24.9, \"serverTime\": \"2026-06-02T08:27:20.712Z\", \"endTimecode\": 62, \"startPercent\": 0, \"progressFinal\": false, \"startTimecode\": 0, \"progressUpdatedAt\": \"2026-06-02T08:28:23.530Z\"}','play',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1),(53,1,29,'2026-06-02 08:28:38.161','2026-06-02 08:28:38.161',NULL,'player','192.168.50.177','{\"duration\": 250, \"endPercent\": 100, \"serverTime\": \"2026-06-02T08:28:38.157Z\", \"endTimecode\": 250, \"startPercent\": 24.8, \"progressFinal\": true, \"startTimecode\": 62, \"progressUpdatedAt\": \"2026-06-02T08:31:36.940Z\"}','resume',1,1,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1),(54,1,1,'2026-06-04 08:31:36.468','2026-06-04 08:31:36.468',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(55,1,46,'2026-06-04 08:32:06.119','2026-06-04 08:32:06.119','{\"Titre\":\"\",\"Description\":\"\"}','admin_message','192.168.50.177',NULL,'{\"Titre\":\"Test titre\",\"Description\":\"test description.\"}',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(56,1,47,'2026-06-04 08:32:16.304','2026-06-04 08:32:16.304','false','Actif','192.168.50.177',NULL,'true',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(57,1,47,'2026-06-04 08:32:54.086','2026-06-04 08:32:54.086','true','Actif','192.168.50.177',NULL,'false',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(58,1,1,'2026-06-08 08:51:35.488','2026-06-08 08:51:35.488',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(59,1,1,'2026-06-08 13:12:06.418','2026-06-08 13:12:06.418',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(60,1,14,'2026-06-08 16:24:40.488','2026-06-08 16:24:40.488','uploads/serie/2/1779480009225_wokvwj.webp','CheminImage','192.168.50.177',NULL,'uploads/serie/2/1780935880474_6v2uqf.webp',NULL,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(61,1,14,'2026-06-08 16:25:58.125','2026-06-08 16:25:58.125','false','Premium','192.168.50.177',NULL,'true',NULL,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(62,1,14,'2026-06-08 16:25:58.124','2026-06-08 16:25:58.124','','Resumer','192.168.50.177',NULL,'zsdfsdf',NULL,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(63,1,14,'2026-06-08 16:26:13.724','2026-06-08 16:26:13.724','true','Premium','192.168.50.177',NULL,'false',NULL,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(64,1,1,'2026-06-13 05:59:46.668','2026-06-13 05:59:46.668',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(65,1,2,'2026-06-13 06:00:26.264','2026-06-13 06:00:26.264',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(66,2,5,'2026-06-13 06:00:39.064','2026-06-13 06:00:39.064',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(67,2,1,'2026-06-13 06:00:46.985','2026-06-13 06:00:46.985',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(68,2,2,'2026-06-13 06:22:18.118','2026-06-13 06:22:18.118',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(69,1,1,'2026-06-13 06:22:28.813','2026-06-13 06:22:28.813',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(70,1,1,'2026-06-15 15:24:52.094','2026-06-15 15:24:52.094',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(72,1,49,'2026-06-15 15:27:00.270','2026-06-15 15:27:00.270','{\"VideoID\":7,\"Titre\":\"test 5\",\"SaisonID\":null,\"SaisonNumero\":null,\"SeriesID\":null,\"SeriesTitre\":null}','Video','192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(73,1,50,'2026-06-15 15:34:52.593','2026-06-15 15:34:52.593','1','EtatID','192.168.50.177','{\"Titre\": \"test6\", \"VideoID\": 8, \"deletedAt\": \"2026-06-15T15:35:42.294Z\", \"SeriesTitre\": \"test série 2\", \"SaisonNumero\": 1, \"deletedVideoId\": 8, \"deletedSaisonId\": 2, \"deletedSeriesId\": 2, \"deletedVideoTitle\": \"test6\", \"deletedSeriesTitre\": \"test série 2\", \"deletedSaisonNumero\": 1, \"previousAncienneValeur\": \"1\"}','2',2,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(74,1,51,'2026-06-15 15:35:06.363','2026-06-15 15:35:06.363','2','EtatID','192.168.50.177','{\"deletedAt\": \"2026-06-15T15:35:42.294Z\", \"deletedVideoId\": 8, \"deletedSaisonId\": 2, \"deletedSeriesId\": 2, \"deletedVideoTitle\": \"test6\", \"deletedSeriesTitre\": \"test série 2\", \"deletedSaisonNumero\": 1, \"previousAncienneValeur\": \"2\"}','1',2,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(75,1,50,'2026-06-15 15:35:33.001','2026-06-15 15:35:33.001','1','EtatID','192.168.50.177','{\"Titre\": \"test6\", \"VideoID\": 8, \"deletedAt\": \"2026-06-15T15:35:42.294Z\", \"SeriesTitre\": \"test série 2\", \"SaisonNumero\": 1, \"deletedVideoId\": 8, \"deletedSaisonId\": 2, \"deletedSeriesId\": 2, \"deletedVideoTitle\": \"test6\", \"deletedSeriesTitre\": \"test série 2\", \"deletedSaisonNumero\": 1, \"previousAncienneValeur\": \"1\"}','2',2,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(76,1,49,'2026-06-15 15:35:42.340','2026-06-15 15:35:42.340','{\"VideoID\":8,\"Titre\":\"test6\",\"SaisonID\":2,\"SaisonNumero\":1,\"SeriesID\":2,\"SeriesTitre\":\"test série 2\"}','Video','192.168.50.177',NULL,NULL,2,2,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(77,1,50,'2026-06-15 15:58:37.638','2026-06-15 15:58:37.638','1','EtatID','192.168.50.177','{\"Titre\": \"image defaut\", \"VideoID\": 9, \"deletedAt\": \"2026-06-15T15:58:47.251Z\", \"SeriesTitre\": null, \"SaisonNumero\": null, \"deletedVideoId\": 9, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"image defaut\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null, \"previousAncienneValeur\": \"1\"}','2',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(78,1,49,'2026-06-15 15:58:47.305','2026-06-15 15:58:47.305','{\"VideoID\":9,\"Titre\":\"image defaut\",\"SaisonID\":null,\"SaisonNumero\":null,\"SeriesID\":null,\"SeriesTitre\":null}','Video','192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(79,1,15,'2026-06-15 16:00:56.284','2026-06-15 16:00:56.284','image defaut','player','192.168.50.177','{\"duration\": 249, \"deletedAt\": \"2026-06-15T16:04:15.286Z\", \"endPercent\": 2.41, \"serverTime\": \"2026-06-15T16:00:56.278Z\", \"endTimecode\": 6, \"startPercent\": 0, \"progressFinal\": false, \"startTimecode\": 0, \"deletedVideoId\": 10, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"image defaut\", \"progressUpdatedAt\": \"2026-06-15T16:01:02.735Z\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null, \"previousAncienneValeur\": null}','play',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(80,1,50,'2026-06-15 16:01:13.057','2026-06-15 16:01:13.057','1','EtatID','192.168.50.177','{\"Titre\": \"image defaut\", \"VideoID\": 10, \"deletedAt\": \"2026-06-15T16:04:15.286Z\", \"SeriesTitre\": null, \"SaisonNumero\": null, \"deletedVideoId\": 10, \"deletedSaisonId\": null, \"deletedSeriesId\": null, \"deletedVideoTitle\": \"image defaut\", \"deletedSeriesTitre\": null, \"deletedSaisonNumero\": null, \"previousAncienneValeur\": \"1\"}','2',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(81,1,49,'2026-06-15 16:04:15.326','2026-06-15 16:04:15.326','{\"VideoID\":10,\"Titre\":\"image defaut\",\"SaisonID\":null,\"SaisonNumero\":null,\"SeriesID\":null,\"SeriesTitre\":null}','Video','192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(82,1,13,'2026-06-15 16:33:49.205','2026-06-15 16:33:49.205','uploads/video/6/affiche/affiche.png','CheminImage','192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',6),(83,1,13,'2026-06-15 16:34:09.858','2026-06-15 16:34:09.858',NULL,'CheminImage','192.168.50.177',NULL,'uploads/video/6/affiche/affiche_1781541249842_kup8vk.png',NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',6),(84,1,1,'2026-06-17 12:45:41.169','2026-06-17 12:45:41.169',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL),(85,1,1,'2026-06-18 17:17:36.857','2026-06-18 17:17:36.857',NULL,NULL,'192.168.50.177',NULL,NULL,NULL,NULL,'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',NULL);
/*!40000 ALTER TABLE `Log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Personne`
--

DROP TABLE IF EXISTS `Personne`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Personne` (
  `PersonneID` int NOT NULL AUTO_INCREMENT,
  `Nom` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Prenom` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Surnom` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `CheminImage` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ImageStatut` enum('DEFAULT','CUSTOM') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DEFAULT',
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`PersonneID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Personne`
--

LOCK TABLES `Personne` WRITE;
/*!40000 ALTER TABLE `Personne` DISABLE KEYS */;
/*!40000 ALTER TABLE `Personne` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Saison`
--

DROP TABLE IF EXISTS `Saison`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Saison` (
  `SaisonID` int NOT NULL AUTO_INCREMENT,
  `Numero` int NOT NULL,
  `SeriesID` int NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `UtilisateurID` int DEFAULT NULL,
  PRIMARY KEY (`SaisonID`),
  KEY `Saison_SeriesID_fkey` (`SeriesID`),
  KEY `Saison_UtilisateurID_fkey` (`UtilisateurID`),
  CONSTRAINT `Saison_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series` (`SeriesID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Saison_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Saison`
--

LOCK TABLES `Saison` WRITE;
/*!40000 ALTER TABLE `Saison` DISABLE KEYS */;
INSERT INTO `Saison` VALUES (1,1,1,'2026-05-18 13:42:23.189',1),(2,1,2,'2026-05-22 19:59:13.846',1),(4,2,1,'2026-06-15 15:44:21.063',1),(5,1,3,'2026-06-15 16:11:24.386',1);
/*!40000 ALTER TABLE `Saison` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Series`
--

DROP TABLE IF EXISTS `Series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Series` (
  `SeriesID` int NOT NULL AUTO_INCREMENT,
  `Titre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Resumer` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CheminImage` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `EtatID` int NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `UtilisateurID` int DEFAULT NULL,
  `Premium` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`SeriesID`),
  KEY `Series_EtatID_fkey` (`EtatID`),
  KEY `Series_UtilisateurID_fkey` (`UtilisateurID`),
  CONSTRAINT `Series_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat` (`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Series_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Series`
--

LOCK TABLES `Series` WRITE;
/*!40000 ALTER TABLE `Series` DISABLE KEYS */;
INSERT INTO `Series` VALUES (1,'test série avec la nouvelle reprise','Entre Magny-en-Vexin et Gisors, à moins d\'une heure de Paris, au coeur d\'un environnement vallonné préservé, cette remarquable propriété à vendre de 35 hectares séduit par son calme absolu et ses vues à 360°. Dominant le paysage, la maison principale d\'environ 1.000 m², construite dans les années 70 et entièrement réhabilitée (désamiantage, isolation, huisseries, façades, réseaux, chauffage, piscine), offre aujourd\'hui une structure saine et moderne. Entièrement décloisonnée, elle constitue une page blanche à aménager selon vos envies. Un projet d\'architecte propose de vastes pièces de réception, plusieurs suites, une bibliothèque, un bureau, ainsi qu\'un espace bien-être. En sous-sol : buanderie, cave à vin et garages. Le domaine, alternant bois et prairies, comprend également un parc d\'accrobranche neuf. Un lieu d\'exception à l\'abri de toute nuisance, idéal pour un projet de prestige.','uploads/serie/1/1779116495112_47m2wn.webp',1,'2026-05-18 13:42:14.940',1,1),(2,'test série 2','zsdfsdf','uploads/serie/2/1780935880474_6v2uqf.webp',1,'2026-05-22 19:59:06.286',1,0),(3,'image defaut','','',1,'2026-06-15 16:11:06.689',1,0);
/*!40000 ALTER TABLE `Series` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SeriesGenre`
--

DROP TABLE IF EXISTS `SeriesGenre`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `SeriesGenre` (
  `SeriesGenreID` int NOT NULL AUTO_INCREMENT,
  `SeriesID` int NOT NULL,
  `GenreID` int NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`SeriesGenreID`),
  KEY `SeriesGenre_SeriesID_fkey` (`SeriesID`),
  KEY `SeriesGenre_GenreID_fkey` (`GenreID`),
  CONSTRAINT `SeriesGenre_GenreID_fkey` FOREIGN KEY (`GenreID`) REFERENCES `Genre` (`GenreID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `SeriesGenre_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series` (`SeriesID`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SeriesGenre`
--

LOCK TABLES `SeriesGenre` WRITE;
/*!40000 ALTER TABLE `SeriesGenre` DISABLE KEYS */;
INSERT INTO `SeriesGenre` VALUES (1,1,13,'2026-05-20 13:51:23.200');
/*!40000 ALTER TABLE `SeriesGenre` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SeriesPersonne`
--

DROP TABLE IF EXISTS `SeriesPersonne`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `SeriesPersonne` (
  `SeriesPersonneID` int NOT NULL AUTO_INCREMENT,
  `SeriesID` int NOT NULL,
  `PersonneID` int NOT NULL,
  `EstActeur` tinyint(1) NOT NULL DEFAULT '0',
  `EstRealisateur` tinyint(1) NOT NULL DEFAULT '0',
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`SeriesPersonneID`),
  UNIQUE KEY `SeriesPersonne_SeriesID_PersonneID_key` (`SeriesID`,`PersonneID`),
  KEY `SeriesPersonne_PersonneID_idx` (`PersonneID`),
  KEY `SeriesPersonne_SeriesID_idx` (`SeriesID`),
  CONSTRAINT `SeriesPersonne_PersonneID_fkey` FOREIGN KEY (`PersonneID`) REFERENCES `Personne` (`PersonneID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `SeriesPersonne_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series` (`SeriesID`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SeriesPersonne`
--

LOCK TABLES `SeriesPersonne` WRITE;
/*!40000 ALTER TABLE `SeriesPersonne` DISABLE KEYS */;
/*!40000 ALTER TABLE `SeriesPersonne` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserSeriesWatchReset`
--

DROP TABLE IF EXISTS `UserSeriesWatchReset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `UserSeriesWatchReset` (
  `UserSeriesWatchResetID` bigint NOT NULL AUTO_INCREMENT,
  `UserID` int NOT NULL,
  `SeriesID` int NOT NULL,
  `ResetAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `CreatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `UpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`UserSeriesWatchResetID`),
  UNIQUE KEY `uniq_user_series_watch_reset` (`UserID`,`SeriesID`),
  KEY `idx_user_series_watch_reset_user` (`UserID`),
  KEY `idx_user_series_watch_reset_series` (`SeriesID`),
  CONSTRAINT `UserSeriesWatchReset_SeriesID_fkey` FOREIGN KEY (`SeriesID`) REFERENCES `Series` (`SeriesID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserSeriesWatchReset_UserID_fkey` FOREIGN KEY (`UserID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserSeriesWatchReset`
--

LOCK TABLES `UserSeriesWatchReset` WRITE;
/*!40000 ALTER TABLE `UserSeriesWatchReset` DISABLE KEYS */;
INSERT INTO `UserSeriesWatchReset` VALUES (1,1,1,'2026-05-20 19:12:07.884','2026-05-18 15:00:53.580','2026-05-20 19:12:07.885');
/*!40000 ALTER TABLE `UserSeriesWatchReset` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserVideoProgress`
--

DROP TABLE IF EXISTS `UserVideoProgress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `UserVideoProgress` (
  `UserVideoProgressID` bigint NOT NULL AUTO_INCREMENT,
  `UserID` int NOT NULL,
  `VideoID` int NOT NULL,
  `Timecode` int NOT NULL,
  `Duration` int NOT NULL,
  `ProgressPercent` decimal(5,2) NOT NULL DEFAULT (((`Timecode` / `Duration`) * 100)),
  `UpdatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`UserVideoProgressID`),
  UNIQUE KEY `uniq_user_video` (`UserID`,`VideoID`),
  KEY `idx_user_video_progress_user` (`UserID`),
  KEY `idx_user_video_progress_video` (`VideoID`),
  CONSTRAINT `UserVideoProgress_UserID_fkey` FOREIGN KEY (`UserID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserVideoProgress_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video` (`VideoID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserVideoProgress`
--

LOCK TABLES `UserVideoProgress` WRITE;
/*!40000 ALTER TABLE `UserVideoProgress` DISABLE KEYS */;
/*!40000 ALTER TABLE `UserVideoProgress` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Utilisateur`
--

DROP TABLE IF EXISTS `Utilisateur`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Utilisateur` (
  `UtilisateurID` int NOT NULL AUTO_INCREMENT,
  `Surnom` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MotDePasse` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CheminImage` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Email` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Salt` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `GradeID` int NOT NULL,
  `EtatID` int NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `LastLogin` datetime(3) DEFAULT NULL,
  `PremiumEndDate` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`UtilisateurID`),
  UNIQUE KEY `Utilisateur_Surnom_key` (`Surnom`),
  KEY `Utilisateur_GradeID_fkey` (`GradeID`),
  KEY `Utilisateur_EtatID_fkey` (`EtatID`),
  CONSTRAINT `Utilisateur_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat` (`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Utilisateur_GradeID_fkey` FOREIGN KEY (`GradeID`) REFERENCES `Grade` (`GradeID`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Utilisateur`
--

LOCK TABLES `Utilisateur` WRITE;
/*!40000 ALTER TABLE `Utilisateur` DISABLE KEYS */;
INSERT INTO `Utilisateur` VALUES (1,'Patrick','$2b$10$DsX4fe4k1yrTDToFSTlHPONh1S8pGMYTnZy.bFaDgAM8GW5sM/W2i','/uploads/pp/1/1778698109751-1770245652743_d37o9f.webp','patrick@gmail.com','$2b$10$DsX4fe4k1yrTDToFSTlHPO',1,1,'2026-05-13 18:46:36.166','2026-06-18 17:17:36.841',NULL),(2,'Alexander','$2b$10$OnkApQsKEwQ9vQj0LhhK1OgzXoXIXWMmk7rc2.sCE.adDzjtHZd3a',NULL,'alex@gmail.com','$2b$10$OnkApQsKEwQ9vQj0LhhK1O',2,1,'2026-05-13 18:46:36.166','2026-06-13 06:00:46.980',NULL);
/*!40000 ALTER TABLE `Utilisateur` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UtilisateurGenre`
--

DROP TABLE IF EXISTS `UtilisateurGenre`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `UtilisateurGenre` (
  `UtilisateurGenreID` int NOT NULL AUTO_INCREMENT,
  `UtilisateurID` int NOT NULL,
  `GenreID` int NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`UtilisateurGenreID`),
  KEY `UtilisateurGenre_UtilisateurID_fkey` (`UtilisateurID`),
  KEY `UtilisateurGenre_GenreID_fkey` (`GenreID`),
  CONSTRAINT `UtilisateurGenre_GenreID_fkey` FOREIGN KEY (`GenreID`) REFERENCES `Genre` (`GenreID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `UtilisateurGenre_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UtilisateurGenre`
--

LOCK TABLES `UtilisateurGenre` WRITE;
/*!40000 ALTER TABLE `UtilisateurGenre` DISABLE KEYS */;
INSERT INTO `UtilisateurGenre` VALUES (25,1,5,'2026-06-15 16:45:33.660'),(26,1,308,'2026-06-15 16:45:33.660'),(27,1,12,'2026-06-15 16:45:33.660'),(28,1,10,'2026-06-15 16:45:33.660'),(29,1,307,'2026-06-15 16:45:33.660');
/*!40000 ALTER TABLE `UtilisateurGenre` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Video`
--

DROP TABLE IF EXISTS `Video`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Video` (
  `VideoID` int NOT NULL AUTO_INCREMENT,
  `Titre` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Resumer` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `CheminAcces` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CheminImage` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `EtatID` int NOT NULL,
  `SaisonID` int DEFAULT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  `UtilisateurID` int DEFAULT NULL,
  `Premium` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`VideoID`),
  KEY `Video_EtatID_fkey` (`EtatID`),
  KEY `Video_SaisonID_fkey` (`SaisonID`),
  KEY `Video_UtilisateurID_fkey` (`UtilisateurID`),
  CONSTRAINT `Video_EtatID_fkey` FOREIGN KEY (`EtatID`) REFERENCES `Etat` (`EtatID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Video_SaisonID_fkey` FOREIGN KEY (`SaisonID`) REFERENCES `Saison` (`SaisonID`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Video_UtilisateurID_fkey` FOREIGN KEY (`UtilisateurID`) REFERENCES `Utilisateur` (`UtilisateurID`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Video`
--

LOCK TABLES `Video` WRITE;
/*!40000 ALTER TABLE `Video` DISABLE KEYS */;
INSERT INTO `Video` VALUES (1,'test serie 01',NULL,'uploads/video/1/hls/master.m3u8',NULL,1,1,'2026-05-18 13:45:30.577',1,0),(2,'test serie 02',NULL,'uploads/video/2/hls/master.m3u8',NULL,1,5,'2026-05-18 13:45:38.592',1,0),(3,'test serie 03',NULL,'uploads/video/3/hls/master.m3u8',NULL,1,4,'2026-05-18 13:45:46.977',1,0),(5,'test 3',NULL,'uploads/video/5/hls/master.m3u8',NULL,1,2,'2026-05-19 15:35:09.536',1,0),(6,'test 4',NULL,'uploads/video/6/hls/master.m3u8','uploads/video/6/affiche/affiche_1781541249842_kup8vk.png',1,NULL,'2026-05-19 15:35:42.360',1,0);
/*!40000 ALTER TABLE `Video` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `VideoGenre`
--

DROP TABLE IF EXISTS `VideoGenre`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `VideoGenre` (
  `VideoGenreID` int NOT NULL AUTO_INCREMENT,
  `VideoID` int NOT NULL,
  `GenreID` int NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`VideoGenreID`),
  KEY `VideoGenre_VideoID_fkey` (`VideoID`),
  KEY `VideoGenre_GenreID_fkey` (`GenreID`),
  CONSTRAINT `VideoGenre_GenreID_fkey` FOREIGN KEY (`GenreID`) REFERENCES `Genre` (`GenreID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VideoGenre_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video` (`VideoID`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `VideoGenre`
--

LOCK TABLES `VideoGenre` WRITE;
/*!40000 ALTER TABLE `VideoGenre` DISABLE KEYS */;
INSERT INTO `VideoGenre` VALUES (1,6,36,'2026-05-20 13:51:01.860');
/*!40000 ALTER TABLE `VideoGenre` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `VideoPersonne`
--

DROP TABLE IF EXISTS `VideoPersonne`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `VideoPersonne` (
  `VideoPersonneID` int NOT NULL AUTO_INCREMENT,
  `VideoID` int NOT NULL,
  `PersonneID` int NOT NULL,
  `EstActeur` tinyint(1) NOT NULL DEFAULT '0',
  `EstRealisateur` tinyint(1) NOT NULL DEFAULT '0',
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`VideoPersonneID`),
  UNIQUE KEY `VideoPersonne_VideoID_PersonneID_key` (`VideoID`,`PersonneID`),
  KEY `VideoPersonne_PersonneID_idx` (`PersonneID`),
  KEY `VideoPersonne_VideoID_idx` (`VideoID`),
  CONSTRAINT `VideoPersonne_PersonneID_fkey` FOREIGN KEY (`PersonneID`) REFERENCES `Personne` (`PersonneID`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `VideoPersonne_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video` (`VideoID`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `VideoPersonne`
--

LOCK TABLES `VideoPersonne` WRITE;
/*!40000 ALTER TABLE `VideoPersonne` DISABLE KEYS */;
/*!40000 ALTER TABLE `VideoPersonne` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `VideoSubtitle`
--

DROP TABLE IF EXISTS `VideoSubtitle`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `VideoSubtitle` (
  `VideoSubtitleID` int NOT NULL AUTO_INCREMENT,
  `Label` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CheminSubtitle` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `VideoID` int NOT NULL,
  `CreateDate` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`VideoSubtitleID`),
  KEY `VideoSubtitle_VideoID_fkey` (`VideoID`),
  CONSTRAINT `VideoSubtitle_VideoID_fkey` FOREIGN KEY (`VideoID`) REFERENCES `Video` (`VideoID`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `VideoSubtitle`
--

LOCK TABLES `VideoSubtitle` WRITE;
/*!40000 ALTER TABLE `VideoSubtitle` DISABLE KEYS */;
/*!40000 ALTER TABLE `VideoSubtitle` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-18 19:18:11
