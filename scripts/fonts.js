import { FONT_PRESETS } from "./constants.js";
import { mergeDisplay } from "./data.js";

const FILE_FONT_ID = "foundry-karaoke-file-font";

export function ensureFonts(display) {
  const d = mergeDisplay(display);
  const preset = FONT_PRESETS.find((f) => f.id === d.fontPreset);
  if (preset?.google) loadGoogleFont(preset.google);
  if (d.fontPreset === "file" && d.fontFile) loadFileFont(d.fontFile);
}

function loadGoogleFont(query) {
  const id = `foundry-karaoke-google-${query.replace(/[^a-z0-9]+/gi, "-")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
  document.head.appendChild(link);
}

function loadFileFont(path) {
  let style = document.getElementById(FILE_FONT_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = FILE_FONT_ID;
    document.head.appendChild(style);
  }
  const format = fontFormat(path);
  const url = encodeURI(path);
  style.textContent = `
    @font-face {
      font-family: "FoundryKaraokeFont";
      src: url("${url}")${format ? ` format("${format}")` : ""};
      font-display: swap;
    }
  `;
}

function fontFormat(path) {
  const ext = String(path).split(".").pop()?.toLowerCase();
  return { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" }[ext] ?? "";
}
