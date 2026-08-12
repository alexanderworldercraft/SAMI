import { resolvePlayerLanguageFlag } from "./playerLanguageFlags";

it("priorise le drapeau québécois lorsque le libellé VFQ accompagne un fichier français", () => {
  expect(resolvePlayerLanguageFlag({
    label: "VFQ Forced",
    source: "/uploads/video/14/sousTitre/fre_3.vtt",
  })?.id).toBe("fr-quebec");
});

it("déduit la langue historique depuis le nom du fichier de sous-titre", () => {
  expect(resolvePlayerLanguageFlag({
    label: "SDH",
    source: "/uploads/video/14/sousTitre/jpn_3.vtt",
  })?.id).toBe("ja-japan");
});

it("utilise directement le code normalisé d'une piste audio", () => {
  expect(resolvePlayerLanguageFlag({ language: "fra" })?.id).toBe("fr-france");
});

it("renvoie une valeur neutre lorsqu'aucune langue n'est identifiable", () => {
  expect(resolvePlayerLanguageFlag({ label: "Sous-titre 1" })).toBeNull();
});
