export const videoSchema = {
    body: {
      type: "object",
      required: ["Titre", "Resumer", "CheminAcces", "CheminImage", "EtatID", "GenreIDs"],
      properties: {
        Titre: { type: "string" },
        Resumer: { type: "string" },
        CheminAcces: { type: "string" },
        CheminImage: { type: "string" },
        EtatID: { type: "number" },
        GenreIDs: { type: "array", items: { type: "number" } },
      },
    },
  };
  