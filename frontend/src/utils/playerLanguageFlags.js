import brazilFlag from "../assets/language-flags/brazil.svg";
import chinaFlag from "../assets/language-flags/china.svg";
import franceFlag from "../assets/language-flags/france.svg";
import germanyFlag from "../assets/language-flags/germany.svg";
import italyFlag from "../assets/language-flags/italy.svg";
import japanFlag from "../assets/language-flags/japan.svg";
import portugalFlag from "../assets/language-flags/portugal.svg";
import quebecFlag from "../assets/language-flags/quebec.svg";
import southKoreaFlag from "../assets/language-flags/south-korea.svg";
import spainFlag from "../assets/language-flags/spain.svg";
import taiwanFlag from "../assets/language-flags/taiwan.svg";
import unitedKingdomFlag from "../assets/language-flags/united-kingdom.svg";

// La première règle compatible gagne. Placez donc toujours les variantes
// régionales (VFQ, brésilien, chinois traditionnel...) avant la langue générique.
export const PLAYER_LANGUAGE_FLAGS = [
  {
    id: "fr-quebec",
    name: "québécois",
    src: quebecFlag,
    codes: ["frq", "vfq", "fr-ca"],
    keywords: ["vfq", "quebec", "quebecois", "canadian french"],
  },
  {
    id: "pt-brazil",
    name: "brésilien",
    src: brazilFlag,
    codes: ["pt-br", "pob"],
    keywords: ["brazilian", "bresilien", "brasil"],
  },
  {
    id: "zh-taiwan",
    name: "chinois traditionnel",
    src: taiwanFlag,
    codes: ["zh-tw", "zht"],
    keywords: ["traditional", "traditionnel", "taiwan"],
  },
  {
    id: "fr-france",
    name: "français",
    src: franceFlag,
    codes: ["fr", "fra", "fre", "frf", "vff"],
    keywords: ["francais", "french", "vff"],
  },
  {
    id: "ja-japan",
    name: "japonais",
    src: japanFlag,
    codes: ["ja", "jp", "jpn", "jap"],
    keywords: ["japonais", "japanese"],
  },
  {
    id: "en-united-kingdom",
    name: "anglais",
    src: unitedKingdomFlag,
    codes: ["en", "eng"],
    keywords: ["anglais", "english"],
  },
  {
    id: "de-germany",
    name: "allemand",
    src: germanyFlag,
    codes: ["de", "deu", "ger"],
    keywords: ["allemand", "german", "deutsch"],
  },
  {
    id: "es-spain",
    name: "espagnol",
    src: spainFlag,
    codes: ["es", "esp", "spa"],
    keywords: ["espagnol", "spanish", "spain", "castilian"],
  },
  {
    id: "it-italy",
    name: "italien",
    src: italyFlag,
    codes: ["it", "ita"],
    keywords: ["italien", "italian"],
  },
  {
    id: "pt-portugal",
    name: "portugais",
    src: portugalFlag,
    codes: ["pt", "por"],
    keywords: ["portugais", "portuguese"],
  },
  {
    id: "ko-south-korea",
    name: "coréen",
    src: southKoreaFlag,
    codes: ["ko", "kor"],
    keywords: ["coreen", "korean"],
  },
  {
    id: "zh-china",
    name: "chinois simplifié",
    src: chinaFlag,
    codes: ["zh", "zho", "chi", "zh-cn"],
    keywords: ["chinois", "chinese", "simplified", "simplifie"],
  },
];

const normalizeLanguageValue = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/_/g, "-")
  .replace(/[^a-z0-9-]+/g, " ")
  .trim();

const extractSourceLanguageCode = (source) => {
  const filename = String(source || "").split(/[\\/]/).pop() || "";
  const normalizedFilename = filename.toLowerCase().replace(/_/g, "-");
  return normalizedFilename.match(/^([a-z]{2,3}(?:-[a-z]{2})?)(?:-\d+)?\.vtt(?:[?#].*)?$/)?.[1] || "";
};

const matchesCode = (value, codes) => codes.some(
  (code) => value === code || value.startsWith(`${code}-`)
);

export const resolvePlayerLanguageFlag = ({ language, label, source } = {}) => {
  const normalizedLanguage = normalizeLanguageValue(language);
  const normalizedLabel = normalizeLanguageValue(label);
  const sourceLanguage = extractSourceLanguageCode(source);
  const searchableText = `${normalizedLanguage} ${normalizedLabel}`.trim();

  return PLAYER_LANGUAGE_FLAGS.find((flag) => (
    matchesCode(normalizedLanguage, flag.codes)
    || flag.keywords.some((keyword) => searchableText.includes(keyword))
    || matchesCode(sourceLanguage, flag.codes)
  )) || null;
};
