import {
  buildPersonDisplayName,
  buildPersonPageMetadata,
} from "./personPageMetadata";

describe("buildPersonPageMetadata", () => {
  test("construit toutes les métadonnées d'une personne avec sa photo", () => {
    const person = {
      Prenom: "Dwayne",
      Nom: "Johnson",
      Surnom: "The Rock",
      CheminImage: "uploads/people/7/portrait.webp",
    };

    const metadata = buildPersonPageMetadata({
      id: 7,
      person,
      siteName: "Mon SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://media.sami.example",
    });

    expect(buildPersonDisplayName(person)).toBe("Dwayne Johnson “The Rock”");
    expect(metadata).toEqual({
      siteName: "Mon SAMI",
      title: "Dwayne Johnson “The Rock” - Mon SAMI",
      description: "Découvrez la filmographie de Dwayne Johnson “The Rock” sur Mon SAMI : films et séries en réalisation et distribution.",
      canonicalUrl: "https://sami.example/personnes/7",
      imageUrl: "https://media.sami.example/uploads/people/7/portrait.webp",
      imageAlt: "Portrait de Dwayne Johnson “The Rock”",
      openGraphType: "profile",
    });
  });

  test("utilise le logo lorsque la photo est absente ou invalide", () => {
    const metadata = buildPersonPageMetadata({
      id: 8,
      person: { Prenom: "Tom", Nom: "Hanks", CheminImage: "../secret.jpg" },
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
      assetOrigin: "https://media.sami.example",
    });

    expect(metadata.imageUrl).toBe("https://sami.example/logo512.png");
    expect(metadata.imageAlt).toBe("Logo de SAMI");
    expect(metadata.openGraphType).toBe("profile");
  });

  test("revient sur les métadonnées génériques pour un identifiant invalide", () => {
    const metadata = buildPersonPageMetadata({
      id: "1e3",
      person: null,
      siteName: "SAMI",
      pageOrigin: "https://sami.example",
    });

    expect(metadata.title).toBe("Personnes - SAMI");
    expect(metadata.canonicalUrl).toBe("https://sami.example/personnes");
    expect(metadata.openGraphType).toBe("website");
  });
});
