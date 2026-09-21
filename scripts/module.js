import { MODULE_ID } from "./constants.js";
import { KaraokeEditor, KaraokeManager } from "./apps.js";
import {
  buildExportPack,
  collectKaraokeSounds,
  getTrack,
  importTracks,
  parseImportPayload,
  pickLocalJsonFile,
  saveJsonFile,
  setTrack
} from "./data.js";
import { overlay } from "./overlay.js";
import { registerPlaylistUi } from "./playlist-ui.js";
import { registerSceneControls, registerSettings } from "./settings.js";

Hooks.once("init", () => {
  registerSettings();
  registerSceneControls();
  registerPlaylistUi();
  console.log(`${MODULE_ID} | Initialized for Foundry V14`);
});

Hooks.once("ready", () => {
  overlay.mount();
  const api = {
    openManager: () => KaraokeManager.toggle(),
    openEditor: (sound) => KaraokeEditor.open(sound),
    exportWorld: () => {
      const rows = collectKaraokeSounds();
      saveJsonFile(buildExportPack(rows), "foundry-karaoke.json");
      return rows.length;
    },
    importJson: async (raw) => {
      const payload = raw ?? await pickLocalJsonFile();
      const tracks = parseImportPayload(payload);
      if (!tracks) throw new Error("Invalid karaoke JSON");
      return importTracks(tracks);
    },
    getTrack,
    setTrack,
    overlay
  };
  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = api;
  globalThis.foundryKaraoke = api;
});

Hooks.on("updatePlaylistSound", () => overlay.refresh());
Hooks.on("updatePlaylist", () => overlay.refresh());
Hooks.on(`${MODULE_ID}.refreshOverlay`, () => overlay.refresh());
