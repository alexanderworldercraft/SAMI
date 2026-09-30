import { classicInterface } from "../classic";

// Point d'entrée réservé à l'étape TV, après validation de tactile.
export const remoteInterface = Object.freeze({
  ...classicInterface,
  id: "remote",
  fallback: "classic",
});
