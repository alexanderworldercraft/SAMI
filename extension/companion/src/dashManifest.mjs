import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";

// Resolve URL inheritance before giving the manifest to FFmpeg. Every media URL,
// including SegmentTemplate substitutions, stays behind the credential-scoped relay.
export function rewriteDash(source, manifestUrl, register) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Déclarations XML externes interdites.");
  if (XMLValidator.validate(source) !== true) throw new Error("Manifeste DASH XML invalide.");
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false });
  const document = parser.parse(source);
  if (!document.MPD) throw new Error("Manifeste DASH invalide.");
  if (document.MPD["@_type"] === "dynamic") throw new Error("DASH en direct non pris en charge : choisissez une vidéo à durée finie.");
  const walk = (node, parentBase, inheritedTemplate, inheritedList, name = "") => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child) => walk(child, parentBase, inheritedTemplate, inheritedList, name)); return; }
    if (Object.hasOwn(node, "ContentProtection")) throw new Error("Ce manifeste DASH utilise une protection non prise en charge.");
    for (const key of Object.keys(node)) if (/xlink.*href/i.test(key)) throw new Error("Manifeste DASH externe non pris en charge.");
    const rawBase = Array.isArray(node.BaseURL) ? node.BaseURL[0] : node.BaseURL;
    const value = typeof rawBase === "object" ? rawBase?.["#text"] : rawBase;
    const base = value ? new URL(String(value).trim(), parentBase).href : parentBase;
    delete node.BaseURL;
    delete node.Location; delete node.PatchLocation; delete node.UTCTiming;
    const template = node.SegmentTemplate || inheritedTemplate;
    const list = node.SegmentList || inheritedList;
    if (["MPD", "Period", "AdaptationSet"].includes(name)) {
      delete node.SegmentTemplate; delete node.SegmentList;
    }
    if (name === "Representation") {
      if (template) node.SegmentTemplate = structuredClone(template);
      else if (list) node.SegmentList = structuredClone(list);
      else node.BaseURL = register(base);
    }
    for (const attribute of ["@_media", "@_initialization", "@_sourceURL", "@_index"]) {
      if (node[attribute]) node[attribute] = register(new URL(node[attribute], base).href);
    }
    for (const [key, child] of Object.entries(node)) if (!key.startsWith("@_") && key !== "BaseURL") walk(child, base, template, list, key);
  };
  walk(document.MPD, manifestUrl, undefined, undefined, "MPD");
  return new XMLBuilder({ ignoreAttributes: false, suppressEmptyNode: true, suppressBooleanAttributes: false }).build(document);
}
