import {
  MODULE_ID,
  FLAG_KEY,
  SCHEMA,
  SCHEMA_VERSION,
  FONT_PRESETS,
  LANGUAGE_PRESETS,
  LOCATION_PRESETS,
  defaultDisplay,
  defaultLanguage
} from "./constants.js";

export const clientLanguage = {
  mainId: null,
  secondaryId: null
};

export function localize(key, data) {
  const full = key.startsWith("KARAOKE.") ? key : `KARAOKE.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function mergeDisplay(source = {}) {
  const display = foundry.utils.mergeObject(defaultDisplay(), source, { inplace: false });
  if (typeof source.showSecondary !== "boolean" && typeof source.dualLanguage === "boolean") {
    display.showSecondary = source.dualLanguage;
  }
  display.dualLanguage = Boolean(display.showSecondary);
  return display;
}

export function slugLanguageId(value, fallback = "lang") {
  const slug = String(value || fallback).trim().replace(/[^\w.-]+/g, "-") || fallback;
  return slug;
}

export function normalizeLanguage(lang, index = 0) {
  if (!lang || typeof lang !== "object") return defaultLanguage(index);
  const preset = LANGUAGE_PRESETS.find((p) => p.id === lang.id);
  const id = slugLanguageId(lang.id || preset?.id || `lang-${index + 1}`, `lang-${index + 1}`);
  return {
    id,
    label: String(lang.label || preset?.label || id).trim() || id,
    fontPreset: lang.fontPreset || preset?.fontPreset || "signika",
    lrc: typeof lang.lrc === "string" ? lang.lrc : ""
  };
}

export function languagesFromLegacy(source = {}) {
  const languages = [];
  const lrc = typeof source.lrc === "string" ? source.lrc : "";
  const lrcRef = typeof source.lrcRef === "string" ? source.lrcRef : "";
  if (lrc.trim() || source.cues?.some((cue) => cue?.text || cue?.texts)) {
    languages.push({
      id: "main",
      label: "Main",
      fontPreset: source.display?.fontPreset || "noto-sans-tc",
      lrc
    });
  }
  if (lrcRef.trim() || source.cues?.some((cue) => cue?.ref)) {
    languages.push({
      id: "secondary",
      label: "Secondary",
      fontPreset: source.display?.referenceFontPreset || "noto-sans-jp",
      lrc: lrcRef
    });
  }
  if (!languages.length) languages.push(defaultLanguage(0));
  return languages.map((lang, index) => normalizeLanguage(lang, index));
}

export function uniqueLanguages(list = []) {
  const seen = new Set();
  const languages = [];
  list.forEach((lang, index) => {
    const normalized = normalizeLanguage(lang, index);
    let id = normalized.id;
    let n = 2;
    while (seen.has(id)) {
      id = `${normalized.id}-${n}`;
      n += 1;
    }
    seen.add(id);
    languages.push({ ...normalized, id });
  });
  return languages.length ? languages : [defaultLanguage(0)];
}

export function mergeTrack(source = {}) {
  const display = mergeDisplay(source.display ?? {});
  const fromArray = Array.isArray(source.languages) ? source.languages : [];
  const languages = uniqueLanguages(fromArray.length ? fromArray : languagesFromLegacy(source));
  const ids = languages.map((lang) => lang.id);
  let cues = Array.isArray(source.cues)
    ? source.cues.map((cue) => normalizeCue(cue, ids)).filter(Boolean)
    : [];
  const built = buildCuesFromLanguages(languages);
  if (built.length) cues = built;
  languages.forEach((lang) => {
    if (!lang.lrc.trim()) lang.lrc = cuesToLrcForLanguage(cues, lang.id);
  });
  if (!ids.includes(display.mainLanguage)) display.mainLanguage = ids[0];
  if (display.secondaryLanguage && !ids.includes(display.secondaryLanguage)) {
    display.secondaryLanguage = ids.find((id) => id !== display.mainLanguage) ?? "";
  }
  if (ids.length > 1 && !display.secondaryLanguage) {
    display.secondaryLanguage = ids.find((id) => id !== display.mainLanguage) ?? "";
  }
  if (typeof source.display?.showSecondary !== "boolean" && typeof source.display?.dualLanguage !== "boolean") {
    display.showSecondary = ids.length > 1 && Boolean(display.secondaryLanguage);
  }
  display.dualLanguage = Boolean(display.showSecondary && display.secondaryLanguage);
  const mainId = display.mainLanguage;
  const secondaryId = display.secondaryLanguage;
  return {
    enabled: source.enabled !== false,
    display,
    languages,
    lrc: languages[0]?.lrc ?? "",
    lrcRef: languages[1]?.lrc ?? "",
    cues: cues.map((cue) => ({
      ...cue,
      text: cue.texts?.[mainId] ?? Object.values(cue.texts ?? {})[0] ?? "",
      ref: secondaryId ? cue.texts?.[secondaryId] ?? "" : ""
    }))
  };
}

export function normalizeCue(cue, languageIds = []) {
  if (!cue || typeof cue !== "object") return null;
  const start = Number(cue.start);
  if (!Number.isFinite(start) || start < 0) return null;
  const endRaw = cue.end == null || cue.end === "" ? null : Number(cue.end);
  const end = Number.isFinite(endRaw) ? endRaw : null;
  const texts = {};
  if (cue.texts && typeof cue.texts === "object") {
    for (const [id, value] of Object.entries(cue.texts)) {
      const text = String(value ?? "").trim();
      if (text) texts[id] = text;
    }
  }
  const mainId = languageIds[0] || "zh-Hant";
  const secondaryId = languageIds[1] || "ja";
  if (cue.text) texts[mainId] = String(cue.text).trim();
  if (cue.ref) texts[secondaryId] = String(cue.ref).trim();
  if (!Object.keys(texts).length) return null;
  return { start, end, texts };
}

export function getTrack(sound) {
  if (!sound) return null;
  const stored = sound.getFlag(MODULE_ID, FLAG_KEY);
  if (!stored) return null;
  return mergeTrack(stored);
}

export function hasKaraoke(sound) {
  const track = getTrack(sound);
  return Boolean(track?.enabled && track.cues?.some((cue) => cueText(cue) || Object.values(cue.texts ?? {}).some(Boolean)));
}

export async function setTrack(sound, data) {
  if (!sound) throw new Error("Missing playlist sound");
  return sound.setFlag(MODULE_ID, FLAG_KEY, mergeTrack(data));
}

export async function clearTrack(sound) {
  return sound.unsetFlag(MODULE_ID, FLAG_KEY);
}

export function resolveFontFamily(display, role = "main", language = null) {
  if (language?.fontPreset) {
    if (language.fontPreset === "custom" && language.customFamily?.trim()) return language.customFamily.trim();
    const preset = FONT_PRESETS.find((f) => f.id === language.fontPreset);
    if (preset?.family) return preset.family;
  }
  const d = mergeDisplay(display);
  if (role === "ref") {
    if (d.referenceFontPreset === "custom" && d.referenceCustomFamily?.trim()) {
      return d.referenceCustomFamily.trim();
    }
    return FONT_PRESETS.find((f) => f.id === d.referenceFontPreset)?.family
      || "\"Noto Sans JP\", sans-serif";
  }
  if (d.fontPreset === "file") return "FoundryKaraokeFont, Signika, sans-serif";
  if (d.fontPreset === "custom" && d.customFamily?.trim()) return d.customFamily.trim();
  return FONT_PRESETS.find((f) => f.id === d.fontPreset)?.family || "Signika, sans-serif";
}

export function cueText(cue, langId) {
  if (!cue) return "";
  if (langId && cue.texts?.[langId]) return cue.texts[langId];
  if (langId && langId === "secondary") return cue.ref || "";
  return cue.texts?.[langId] || cue.text || Object.values(cue.texts ?? {})[0] || "";
}

export function resolveLanguageRoles(track) {
  const languages = track?.languages ?? [];
  const ids = languages.map((lang) => lang.id);
  const display = mergeDisplay(track?.display ?? {});
  let mainId = clientLanguage.mainId || display.mainLanguage || ids[0];
  let secondaryId = clientLanguage.secondaryId;
  if (secondaryId == null) {
    secondaryId = display.showSecondary === false
      ? "off"
      : (display.secondaryLanguage || ids.find((id) => id !== mainId) || "off");
  }
  if (!ids.includes(mainId)) mainId = ids[0] || "";
  if (secondaryId && secondaryId !== "off" && !ids.includes(secondaryId)) {
    secondaryId = ids.find((id) => id !== mainId) || "off";
  }
  if (secondaryId === mainId) secondaryId = ids.find((id) => id !== mainId) || "off";
  const showSecondary = Boolean(secondaryId)
    && secondaryId !== "off"
    && game.settings.get(MODULE_ID, "showReferenceLine") !== false;
  return {
    mainId,
    secondaryId: showSecondary ? secondaryId : "",
    showSecondary,
    languages,
    main: languages.find((lang) => lang.id === mainId) ?? languages[0] ?? null,
    secondary: showSecondary ? languages.find((lang) => lang.id === secondaryId) ?? null : null
  };
}

export function swapClientLanguages(track) {
  const roles = resolveLanguageRoles({
    ...track,
    display: track.display
  });
  const currentMain = clientLanguage.mainId || roles.mainId;
  const currentSecondary = clientLanguage.secondaryId == null ? roles.secondaryId : clientLanguage.secondaryId;
  const other = (currentSecondary && currentSecondary !== "off")
    ? currentSecondary
    : (track.languages ?? []).map((lang) => lang.id).find((id) => id !== currentMain);
  if (!other) return resolveLanguageRoles(track);
  clientLanguage.mainId = other;
  clientLanguage.secondaryId = currentMain || "";
  return resolveLanguageRoles(track);
}

export function lineVisibility(display) {
  const d = mergeDisplay(display);
  const clientPrev = game.settings.get(MODULE_ID, "showPreviousLine") !== false;
  const clientNext = game.settings.get(MODULE_ID, "showNextLine") !== false;
  const clientRef = game.settings.get(MODULE_ID, "showReferenceLine") !== false;
  return {
    previous: Boolean(d.showPrevious) && clientPrev,
    next: Boolean(d.showNext) && clientNext,
    reference: Boolean(d.showSecondary ?? d.dualLanguage) && clientRef && clientLanguage.secondaryId !== "off"
  };
}

export function resolveLocation(display) {
  const d = mergeDisplay(display);
  const preset = LOCATION_PRESETS.find((p) => p.id === d.locationPreset);
  if (preset && d.locationPreset !== "custom") {
    return { x: preset.x, y: preset.y, preset: preset.id };
  }
  return {
    x: clamp(Number(d.x) || 50, 0, 100),
    y: clamp(Number(d.y) || 88, 0, 100),
    preset: "custom"
  };
}

export function worldDefaults() {
  const display = defaultDisplay();
  const fontPreset = game.settings.get(MODULE_ID, "defaultFontPreset") || display.fontPreset;
  const locationPreset = game.settings.get(MODULE_ID, "defaultLocationPreset") || display.locationPreset;
  const font = FONT_PRESETS.find((f) => f.id === fontPreset) ?? FONT_PRESETS[0];
  const loc = LOCATION_PRESETS.find((p) => p.id === locationPreset) ?? LOCATION_PRESETS[4];
  return mergeDisplay({
    fontPreset: font.id,
    locationPreset: loc.id,
    x: loc.x,
    y: loc.y
  });
}

export function newTrackFromSettings() {
  const display = worldDefaults();
  const main = defaultLanguage(0);
  main.fontPreset = display.fontPreset === "cinzel" ? main.fontPreset : display.fontPreset;
  return mergeTrack({
    enabled: true,
    display: { ...display, mainLanguage: main.id, showSecondary: false },
    languages: [main],
    cues: []
  });
}

export function parseFrac(raw) {
  if (!raw) return 0;
  if (raw.length >= 3) return Number(raw.slice(0, 3)) / 1000;
  return Number(raw.padEnd(2, "0").slice(0, 2)) / 100;
}

export function parseTimestamp(minutes, seconds, frac) {
  return Number(minutes) * 60 + Number(seconds) + parseFrac(frac);
}

export function formatStamp(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  const whole = Math.floor(s);
  const cs = Math.min(99, Math.round((s - whole) * 100));
  return `${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function parseLrc(text) {
  if (!text?.trim()) return [];
  const timeTag = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const meta = /^\[(ar|ti|al|by|offset|re|ve):/i;
  const raw = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || meta.test(trimmed)) continue;
    const tags = [...trimmed.matchAll(timeTag)];
    if (!tags.length) continue;
    const lyric = trimmed.replace(timeTag, "").trim();
    if (!lyric) continue;
    const times = tags.map((t) => parseTimestamp(t[1], t[2], t[3]));
    if (times.length >= 2) raw.push({ start: times[0], end: times[1], text: lyric });
    else for (const start of times) raw.push({ start, end: null, text: lyric });
  }
  raw.sort((a, b) => a.start - b.start);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].end == null) raw[i].end = raw[i + 1]?.start ?? raw[i].start + 4;
    if (raw[i].end <= raw[i].start) raw[i].end = raw[i].start + 0.5;
  }
  return raw;
}

export function attachLanguage(cues = [], langId, parsed = []) {
  if (!parsed.length) return cues.map((cue) => cue);
  const used = new Set();
  const paired = cues.map((cue) => {
    let best = -1;
    let bestDist = 0.25;
    parsed.forEach((line, index) => {
      if (used.has(index)) return;
      const dist = Math.abs(line.start - cue.start);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    const texts = { ...(cue.texts ?? {}) };
    if (best >= 0) {
      used.add(best);
      texts[langId] = parsed[best].text;
    }
    return { ...cue, texts };
  });
  parsed.forEach((line, index) => {
    if (used.has(index)) return;
    paired.push({ start: line.start, end: line.end, texts: { [langId]: line.text } });
  });
  paired.sort((a, b) => a.start - b.start);
  return paired;
}

export function buildCuesFromLanguages(languages = []) {
  let cues = [];
  for (const lang of languages) {
    const parsed = parseLrc(lang.lrc);
    if (!parsed.length) continue;
    if (!cues.length) {
      cues = parsed.map((line) => ({
        start: line.start,
        end: line.end,
        texts: { [lang.id]: line.text }
      }));
    } else {
      cues = attachLanguage(cues, lang.id, parsed);
    }
  }
  return cues;
}

export function cuesToLrcForLanguage(cues = [], langId) {
  return cues
    .filter((cue) => Number.isFinite(cue.start) && cueText(cue, langId))
    .sort((a, b) => a.start - b.start)
    .map((cue) => `[${formatStamp(cue.start)}]${cueText(cue, langId)}`)
    .join("\n");
}

export function attachRefs(mainCues = [], refCues = []) {
  return attachLanguage(mainCues.map((cue) => ({
    start: cue.start,
    end: cue.end,
    texts: { ...(cue.texts ?? {}), main: cue.text ?? cue.texts?.main ?? "" }
  })), "secondary", refCues).map((cue) => ({
    start: cue.start,
    end: cue.end,
    text: cue.texts.main || cue.text || "",
    ref: cue.texts.secondary || ""
  }));
}

export function cuesToLrc(cues = [], field = "text") {
  if (field !== "text" && field !== "ref") return cuesToLrcForLanguage(cues, field);
  return cues
    .map((cue) => normalizeCue(cue))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
    .map((cue) => `[${formatStamp(cue.start)}]${field === "ref" ? cue.texts?.ja || cue.ref || "" : cue.texts?.["zh-Hant"] || cue.text || ""}`)
    .filter((line) => !/\[[\d:.]+\]$/.test(line))
    .join("\n");
}

export function findCueIndex(cues, time) {
  if (!cues?.length) return -1;
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const end = cue.end ?? cues[i + 1]?.start ?? cue.start + 4;
    if (time >= cue.start && time < end) return i;
  }
  return -1;
}

export function playbackTime(sound) {
  const instance = sound?.sound;
  if (!instance) return sound?.pausedTime ?? 0;
  if (typeof instance.currentTime === "number") return instance.currentTime;
  return instance.element?.currentTime ?? sound.pausedTime ?? 0;
}

export function collectKaraokeSounds() {
  const rows = [];
  for (const playlist of game.playlists) {
    for (const sound of playlist.sounds) {
      const track = getTrack(sound);
      if (!track) continue;
      rows.push({ playlist, sound, track });
    }
  }
  return rows;
}

export function serializeTrack(playlist, sound, track) {
  const merged = mergeTrack(track);
  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    soundId: sound.id,
    soundName: sound.name,
    soundPath: sound.path ?? "",
    enabled: merged.enabled !== false,
    display: merged.display,
    languages: merged.languages,
    lrc: merged.languages[0]?.lrc ?? "",
    lrcRef: merged.languages[1]?.lrc ?? "",
    cues: merged.cues.map((cue) => ({
      start: cue.start,
      end: cue.end,
      texts: cue.texts ?? {},
      text: cue.text ?? "",
      ref: cue.ref ?? ""
    }))
  };
}

export function buildExportPack(rows = collectKaraokeSounds()) {
  return {
    schema: SCHEMA,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tracks: rows.map(({ playlist, sound, track }) => serializeTrack(playlist, sound, track))
  };
}

export function parseImportPayload(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.tracks)) return data.tracks;
  if (data.soundName || data.lrc || data.lrcRef || data.languages || data.cues) return [data];
  return null;
}

export function findMatchingSound(entry) {
  if (entry.playlistId && entry.soundId) {
    const hit = game.playlists.get(entry.playlistId)?.sounds.get(entry.soundId);
    if (hit) return hit;
  }
  if (entry.soundPath) {
    for (const playlist of game.playlists) {
      const hit = playlist.sounds.find((s) => s.path === entry.soundPath);
      if (hit) return hit;
    }
  }
  if (entry.playlistName && entry.soundName) {
    const playlist = game.playlists.getName(entry.playlistName);
    const hit = playlist?.sounds.getName(entry.soundName);
    if (hit) return hit;
  }
  if (entry.soundName) {
    for (const playlist of game.playlists) {
      const hit = playlist.sounds.getName(entry.soundName);
      if (hit) return hit;
    }
  }
  return null;
}

export async function importTracks(entries, { targetSound = null } = {}) {
  const result = { ok: 0, skip: 0, unmatched: [] };
  const list = targetSound && entries.length ? [entries[0]] : entries;
  for (const entry of list) {
    const sound = targetSound ?? findMatchingSound(entry);
    if (!sound) {
      result.skip += 1;
      result.unmatched.push(entry.soundName || entry.soundPath || entry.soundId || "(unnamed)");
      continue;
    }
    await setTrack(sound, {
      enabled: entry.enabled !== false,
      display: entry.display,
      languages: entry.languages,
      lrc: entry.lrc,
      lrcRef: entry.lrcRef,
      cues: entry.cues
    });
    result.ok += 1;
  }
  return result;
}

export function saveJsonFile(data, filename) {
  const json = JSON.stringify(data, null, 2);
  if (typeof foundry?.utils?.saveDataToFile === "function") {
    foundry.utils.saveDataToFile(json, "text/json", filename);
    return;
  }
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickLocalJsonFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    input.click();
  });
}

export function canSeeOverlay() {
  if (game.settings.get(MODULE_ID, "hideOverlay")) return false;
  const audience = game.settings.get(MODULE_ID, "audience") || "all";
  if (audience === "gm") return game.user.isGM;
  if (audience === "players") return !game.user.isGM;
  return true;
}

export function FilePickerClass() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
