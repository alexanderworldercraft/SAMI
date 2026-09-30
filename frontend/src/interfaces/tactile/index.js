import { classicInterface } from "../classic";

// Point d'entrée réservé à la prochaine étape, après validation de classic.
export const tactileInterface = Object.freeze({
  ...classicInterface,
  id: "tactile",
  fallback: "classic",
});
