export const MODULE_ID = "foundry-karaoke";
export const FLAG_KEY = "track";
export const SCHEMA = "foundry-karaoke";
export const SCHEMA_VERSION = 1;

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
  { id: "georgia", family: "Georgia, serif", label: "Georgia", google: null },
  { id: "times", family: "\"Times New Roman\", Times, serif", label: "Times New Roman", google: null },
  { id: "arial", family: "Arial, Helvetica, sans-serif", label: "Arial", google: null },
  { id: "impact", family: "Impact, Haettenschweiler, sans-serif", label: "Impact", google: null },
  { id: "custom", family: "", label: "Custom family…", google: null },
  { id: "file", family: "FoundryKaraokeFont", label: "Uploaded font file…", google: null }
];

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
    showNext: true
  };
}

export function defaultTrack() {
  return {
    enabled: true,
    display: defaultDisplay(),
    lrc: "",
    cues: []
  };
}
