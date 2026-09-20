import { MODULE_ID } from "./constants.js";
import {
  canSeeOverlay,
  findCueIndex,
  getTrack,
  hasKaraoke,
  mergeDisplay,
  playbackTime,
  resolveFontFamily,
  resolveLocation
} from "./data.js";
import { ensureFonts } from "./fonts.js";

class KaraokeOverlay {
  #root = null;
  #box = null;
  #prev = null;
  #current = null;
  #next = null;
  #raf = 0;
  #previewUntil = 0;
  #previewDisplay = null;
  #previewLines = null;

  mount() {
    if (this.#root?.isConnected) return;
    this.#root = document.createElement("div");
    this.#root.id = "foundry-karaoke-overlay";
    this.#root.className = "fk-overlay fk-hidden";
    this.#root.innerHTML = `
      <div class="fk-lyric-box">
        <div class="fk-line fk-prev"></div>
        <div class="fk-line fk-current" aria-live="polite"></div>
        <div class="fk-line fk-next"></div>
      </div>
    `;
    document.body.appendChild(this.#root);
    this.#box = this.#root.querySelector(".fk-lyric-box");
    this.#prev = this.#root.querySelector(".fk-prev");
    this.#current = this.#root.querySelector(".fk-current");
    this.#next = this.#root.querySelector(".fk-next");
    this.#loop();
  }

  unmount() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#root?.remove();
    this.#root = null;
  }

  showPreview(display, lines, durationMs = 4000) {
    this.mount();
    this.#previewDisplay = mergeDisplay(display);
    this.#previewLines = lines;
    this.#previewUntil = performance.now() + durationMs;
    this.#render(this.#previewDisplay, lines.prev, lines.current, lines.next);
  }

  refresh() {
    this.mount();
    this.#tick();
  }

  #loop = () => {
    this.#tick();
    this.#raf = requestAnimationFrame(this.#loop);
  };

  #tick() {
    if (!this.#root) return;
    if (this.#previewUntil && performance.now() < this.#previewUntil && this.#previewDisplay) {
      const lines = this.#previewLines ?? {};
      this.#render(this.#previewDisplay, lines.prev, lines.current, lines.next);
      return;
    }
    this.#previewUntil = 0;
    this.#previewDisplay = null;

    if (!canSeeOverlay()) {
      this.#hide();
      return;
    }

    const active = this.#activeSound();
    if (!active) {
      this.#hide();
      return;
    }

    const track = getTrack(active);
    const time = playbackTime(active);
    const index = findCueIndex(track.cues, time);
    if (index < 0) {
      this.#hide();
      return;
    }

    const prev = track.display.showPrevious ? track.cues[index - 1]?.text ?? "" : "";
    const next = track.display.showNext ? track.cues[index + 1]?.text ?? "" : "";
    this.#render(track.display, prev, track.cues[index].text, next);
  }

  #activeSound() {
    const playing = [];
    for (const playlist of game.playlists ?? []) {
      for (const sound of playlist.sounds) {
        if (sound.playing && hasKaraoke(sound)) playing.push(sound);
      }
    }
    if (!playing.length) return null;
    return playing[playing.length - 1];
  }

  #render(display, prev, current, next) {
    ensureFonts(display);
    const loc = resolveLocation(display);
    const family = resolveFontFamily(display);
    const size = Number(display.fontSize) || 42;
    const outline = Number(display.outlineWidth) || 0;
    this.#root.classList.remove("fk-hidden");
    this.#box.style.left = `${loc.x}%`;
    this.#box.style.top = `${loc.y}%`;
    this.#box.style.width = `${Number(display.maxWidth) || 80}%`;
    this.#box.style.textAlign = display.textAlign || "center";
    this.#box.style.fontFamily = family;
    this.#box.style.fontSize = `${size}px`;
    this.#box.style.color = display.fontColor || "#fff";
    this.#box.style.setProperty("--fk-highlight", display.highlightColor || "#ffe082");
    this.#box.style.setProperty("--fk-outline", display.outlineColor || "#000");
    this.#box.style.setProperty("--fk-outline-width", `${outline}px`);
    this.#prev.textContent = prev || "";
    this.#current.textContent = current || "";
    this.#next.textContent = next || "";
    this.#prev.classList.toggle("fk-empty", !prev);
    this.#next.classList.toggle("fk-empty", !next);
  }

  #hide() {
    this.#root?.classList.add("fk-hidden");
  }
}

export const overlay = new KaraokeOverlay();
export { MODULE_ID };
