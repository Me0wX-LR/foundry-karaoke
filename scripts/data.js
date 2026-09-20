import {
  MODULE_ID,
  FLAG_KEY,
  SCHEMA,
  SCHEMA_VERSION,
  FONT_PRESETS,
  LOCATION_PRESETS,
  defaultDisplay,
  defaultTrack
} from "./constants.js";

export function localize(key, data) {
  const full = key.startsWith("KARAOKE.") ? key : `KARAOKE.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function mergeDisplay(source = {}) {
  return foundry.utils.mergeObject(defaultDisplay(), source, { inplace: false });
}

export function mergeTrack(source = {}) {
  const base = defaultTrack();
  const merged = foundry.utils.mergeObject(base, source, { inplace: false });
  merged.display = mergeDisplay(source.display ?? base.display);
  merged.cues = Array.isArray(source.cues) ? source.cues.map(normalizeCue).filter(Boolean) : [];
  merged.lrc = typeof source.lrc === "string" ? source.lrc : cuesToLrc(merged.cues);
  merged.enabled = source.enabled !== false;
  if (!merged.cues.length && merged.lrc) merged.cues = parseLrc(merged.lrc);
  return merged;
}

export function normalizeCue(cue) {
  if (!cue || typeof cue !== "object") return null;
  const start = Number(cue.start);
  if (!Number.isFinite(start) || start < 0) return null;
  const endRaw = cue.end == null || cue.end === "" ? null : Number(cue.end);
  const end = Number.isFinite(endRaw) ? endRaw : null;
  const text = String(cue.text ?? "").trim();
  if (!text) return null;
  return { start, end, text };
}

export function getTrack(sound) {
  if (!sound) return null;
  const stored = sound.getFlag(MODULE_ID, FLAG_KEY);
  if (!stored) return null;
  return mergeTrack(stored);
}

export function hasKaraoke(sound) {
  const track = getTrack(sound);
  return Boolean(track?.enabled && track.cues?.length);
}

export async function setTrack(sound, data) {
  if (!sound) throw new Error("Missing playlist sound");
  const track = mergeTrack(data);
  if (!track.cues.length && track.lrc) track.cues = parseLrc(track.lrc);
  if (track.cues.length && !track.lrc) track.lrc = cuesToLrc(track.cues);
  return sound.setFlag(MODULE_ID, FLAG_KEY, track);
}

export async function clearTrack(sound) {
  return sound.unsetFlag(MODULE_ID, FLAG_KEY);
}

export function resolveFontFamily(display) {
  const d = mergeDisplay(display);
  if (d.fontPreset === "file") return "FoundryKaraokeFont, Signika, sans-serif";
  if (d.fontPreset === "custom" && d.customFamily?.trim()) return d.customFamily.trim();
  return FONT_PRESETS.find((f) => f.id === d.fontPreset)?.family || "Signika, sans-serif";
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
  return mergeTrack({
    enabled: true,
    display: worldDefaults(),
    lrc: "",
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

export function cuesToLrc(cues = []) {
  return cues
    .map(normalizeCue)
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
    .map((c) => `[${formatStamp(c.start)}]${c.text}`)
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
  return {
    playlistId: playlist.id,
    playlistName: playlist.name,
    soundId: sound.id,
    soundName: sound.name,
    soundPath: sound.path ?? "",
    enabled: track.enabled !== false,
    display: mergeDisplay(track.display),
    lrc: track.lrc || cuesToLrc(track.cues),
    cues: (track.cues ?? []).map(normalizeCue).filter(Boolean)
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
  if (data.soundName || data.lrc || data.cues) return [data];
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
      lrc: entry.lrc,
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
