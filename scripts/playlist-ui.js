import { KaraokeEditor, KaraokeManager } from "./apps.js";
import { getTrack } from "./data.js";
import { localize } from "./data.js";

export function registerPlaylistUi() {
  wrapSoundContextMenu();
  Hooks.once("setup", wrapSoundContextMenu);
  Hooks.on("renderPlaylistDirectory", onRenderPlaylistDirectory);
}

function wrapSoundContextMenu() {
  const Directory = foundry.applications?.sidebar?.tabs?.PlaylistDirectory;
  if (!Directory?.prototype?._getSoundContextOptions) return;
  if (Directory.prototype._getSoundContextOptions.__foundryKaraoke) return;
  const original = Directory.prototype._getSoundContextOptions;
  Directory.prototype._getSoundContextOptions = function wrappedSoundContextOptions() {
    const options = original.call(this) ?? [];
    options.push({
      icon: '<i class="fa-solid fa-microphone-lines"></i>',
      label: "KARAOKE.ContextEdit",
      visible: () => game.user.isGM,
      onClick: (_event, target) => {
        const sound = resolvePlaylistSound(target);
        if (!sound) return ui.notifications.warn(localize("MissingSound"));
        KaraokeEditor.open(sound);
      }
    });
    return options;
  };
  Directory.prototype._getSoundContextOptions.__foundryKaraoke = true;
}

function resolvePlaylistSound(target) {
  const el = target?.closest?.("[data-sound-id]") ?? target;
  const soundId = el?.dataset?.soundId;
  const playlistEl = el?.closest?.("[data-entry-id], [data-document-id], [data-playlist-id], .playlist");
  const playlistId = playlistEl?.dataset?.entryId
    ?? playlistEl?.dataset?.documentId
    ?? playlistEl?.dataset?.playlistId;
  if (playlistId && soundId) return game.playlists.get(playlistId)?.sounds.get(soundId) ?? null;
  if (!soundId) return null;
  for (const playlist of game.playlists) {
    const sound = playlist.sounds.get(soundId);
    if (sound) return sound;
  }
  return null;
}

function onRenderPlaylistDirectory(app, element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;
  if (game.user.isGM && !root.querySelector("[data-action='foundry-karaoke']")) {
    const header = root.querySelector(".directory-header, header, .window-header");
    const host = header ?? root;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fk-directory-button";
    button.dataset.action = "foundry-karaoke";
    button.innerHTML = `<i class="fa-solid fa-microphone-lines"></i> ${localize("OpenManager")}`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      KaraokeManager.toggle();
    });
    host.prepend(button);
  }

  root.querySelectorAll("[data-sound-id]").forEach((el) => {
    const sound = resolvePlaylistSound(el);
    if (!sound || !getTrack(sound)) return;
    el.classList.add("fk-has-karaoke");
    if (el.querySelector(".fk-sound-badge")) return;
    const badge = document.createElement("i");
    badge.className = "fa-solid fa-microphone-lines fk-sound-badge";
    badge.title = sound.name;
    const track = getTrack(sound);
    badge.dataset.cues = String(track?.cues?.length ?? 0);
    (el.querySelector(".sound-name, .entry-name, .name") ?? el).prepend(badge);
  });
}
