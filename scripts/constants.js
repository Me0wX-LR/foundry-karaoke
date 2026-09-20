export const MODULE_ID = "foundry-karaoke";
export const FLAG_KEY = "track";
export const SCHEMA = "foundry-karaoke";
export const SCHEMA_VERSION = 3;

export const FONT_PRESETS = [
  { id: "signika", family: "Signika, sans-serif", label: "Signika (Foundry)", google: null },
  { id: "modesto", family: "\"Modesto Condensed\", serif", label: "Modesto Condensed (Foundry)", google: null },
  { id: "cinzel", family: "\"Cinzel\", serif", label: "Cinzel", google: "Cinzel:wght@400;700" },
  { id: "uncial", family: "\"Uncial Antiqua\", cursive", label: "Uncial Antiqua", google: "Uncial+Antiqua" },
  { id: "medieval", family: "\"MedievalSharp\", cursive", label: "MedievalSharp", google: "MedievalSharp" },
  { id: "merriweather", family: "\"Merriweather\", serif", label: "Merriweather", google: "Merriweather:wght@400;700" },
  { id: "noto-sans", family: "\"Noto Sans\", sans-serif", label: "Noto Sans", google: "Noto+Sans:wght@400;700" },
  { id: "noto-sans-tc", family: "\"Noto Sans TC\", sans-serif", label: "Noto Sans TC (Traditional Chinese)", google: "Noto+Sans+TC:wght@400;700" },
  { id: "noto-sans-sc", family: "\"Noto Sans SC\", sans-serif", label: "Noto Sans SC (Simplified Chinese)", google: "Noto+Sans+SC:wght@400;700" },
  { id: "noto-sans-jp", family: "\"Noto Sans JP\", sans-serif", label: "Noto Sans JP (Japanese)", google: "Noto+Sans+JP:wght@400;700" },
  { id: "noto-sans-kr", family: "\"Noto Sans KR\", sans-serif", label: "Noto Sans KR (Korean)", google: "Noto+Sans+KR:wght@400;700" },
  { id: "georgia", family: "Georgia, serif", label: "Georgia", google: null },
  { id: "times", family: "\"Times New Roman\", Times, serif", label: "Times New Roman", google: null },
  { id: "arial", family: "Arial, Helvetica, sans-serif", label: "Arial", google: null },
  { id: "impact", family: "Impact, Haettenschweiler, sans-serif", label: "Impact", google: null },
  { id: "custom", family: "", label: "Custom family…", google: null },
  { id: "file", family: "FoundryKaraokeFont", label: "Uploaded font file…", google: null }
];

export const LANGUAGE_PRESETS = [
  { id: "zh-Hant", label: "Traditional Chinese", fontPreset: "noto-sans-tc" },
  { id: "zh-Hans", label: "Simplified Chinese", fontPreset: "noto-sans-sc" },
  { id: "ja", label: "Japanese", fontPreset: "noto-sans-jp" },
  { id: "ko", label: "Korean", fontPreset: "noto-sans-kr" },
  { id: "en", label: "English", fontPreset: "signika" }
];

export function defaultLanguage(index = 0) {
  const preset = LANGUAGE_PRESETS[index] ?? {
    id: `lang-${index + 1}`,
    label: `Language ${index + 1}`,
    fontPreset: "signika"
  };
  return { ...preset, lrc: "" };
}

export const LOCATION_PRESETS = [
  { id: "top", label: "Top", x: 50, y: 10 },
  { id: "upper", label: "Upper third", x: 50, y: 22 },
  { id: "center", label: "Center", x: 50, y: 50 },
  { id: "lower", label: "Lower third", x: 50, y: 78 },
  { id: "bottom", label: "Bottom", x: 50, y: 88 },
  { id: "custom", label: "Custom", x: 50, y: 88 }
];

export function defaultDisplay() {
  return {
    fontPreset: "cinzel",
    customFamily: "",
    fontFile: "",
    fontSize: 42,
    fontColor: "#ffffff",
    highlightColor: "#ffe082",
    outlineColor: "#000000",
    outlineWidth: 4,
    locationPreset: "bottom",
    x: 50,
    y: 88,
    maxWidth: 80,
    textAlign: "center",
    showPrevious: true,
    showNext: true,
    dualLanguage: false,
    showSecondary: false,
    mainLanguage: "zh-Hant",
    secondaryLanguage: "ja",
    referenceFontPreset: "noto-sans-jp",
    referenceCustomFamily: "",
    referenceScale: 55,
    referenceColor: "#f3e5ab"
  };
}

export function defaultTrack() {
  return {
    enabled: true,
    display: defaultDisplay(),
    languages: [defaultLanguage(0)],
    lrc: "",
    lrcRef: "",
    cues: []
  };
}
