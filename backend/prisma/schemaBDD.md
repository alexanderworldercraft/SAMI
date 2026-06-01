# Schema de la BDD
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Etat {
  EtatID       Int          @id @default(autoincrement())
  Nom          String       @db.VarChar(100)
  Utilisateurs Utilisateur[]
  Videos       Video[]
  Series       Series[]     // Ajout d'une relation avec Series
}

model Grade {
  GradeID      Int            @id @default(autoincrement())
  Nom          String         @unique @db.VarChar(50)
  Utilisateurs Utilisateur[]
}

model Genre {
  GenreID      Int           @id @default(autoincrement())
  Nom          String        @db.VarChar(50)
  VideoGenres  VideoGenre[]
  SeriesGenres      SeriesGenre[]
}

// Nouveau modèle pour les séries
model Series {
  SeriesID     Int       @id @default(autoincrement())
  Titre        String    @db.VarChar(100)
  Resumer      String    @db.Text
  CheminImage  String    @db.VarChar(255)
  EtatID       Int
  Etat         Etat       @relation(fields: [EtatID], references: [EtatID])
  Saisons      Saison[]
  SeriesGenres      SeriesGenre[]
}

model SeriesGenre {
  SeriesGenreID Int     @id @default(autoincrement())
  SeriesID      Int
  Series        Series  @relation(fields: [SeriesID], references: [SeriesID])
  GenreID       Int
  Genre         Genre   @relation(fields: [GenreID], references: [GenreID])
}


// Nouveau modèle pour les saisons d'une série
model Saison {
  SaisonID   Int     @id @default(autoincrement())
  Numero     Int
  SeriesID   Int
  Series     Series  @relation(fields: [SeriesID], references: [SeriesID])
  Episodes   Video[] // Les vidéos liées seront des épisodes
}

model Video {
  VideoID        Int             @id @default(autoincrement())
  Titre          String          @db.VarChar(100)
  Resumer        String?         @db.Text
  CheminAcces    String          @db.VarChar(255)
  CheminImage    String?         @db.VarChar(255)
  EtatID         Int
  Etat           Etat            @relation(fields: [EtatID], references: [EtatID])
  
  // Nouvelle colonne optionnelle pour lier un épisode à une saison
  SaisonID       Int?
  Saison         Saison?         @relation(fields: [SaisonID], references: [SaisonID])

  VideoGenres    VideoGenre[]
  VideoSubtitles VideoSubtitle[]
}

model VideoGenre {
  VideoGenreID Int      @id @default(autoincrement())
  VideoID      Int
  Video        Video    @relation(fields: [VideoID], references: [VideoID])
  GenreID      Int
  Genre        Genre    @relation(fields: [GenreID], references: [GenreID])
}

model VideoSubtitle {
  VideoSubtitleID Int      @id @default(autoincrement())
  Label           String   @db.VarChar(100)
  CheminSubtitle  String   @db.VarChar(255)
  VideoID         Int
  Video           Video    @relation(fields: [VideoID], references: [VideoID])
}

model Utilisateur {
  UtilisateurID Int       @id @default(autoincrement())
  Surnom        String    @unique
  MotDePasse    String    @db.VarChar(255)
  CheminImage   String?   @db.VarChar(255)
  Email         String    @db.VarChar(100)
  Salt          String    @db.VarChar(255)
  GradeID       Int
  EtatID        Int
  Grade         Grade     @relation(fields: [GradeID], references: [GradeID])
  Etat          Etat      @relation(fields: [EtatID], references: [EtatID])

  @@index([GradeID], map: "Utilisateur_GradeID_fkey")
  @@index([EtatID], map: "Utilisateur_EtatID_fkey")
}
```