import { MODULE_ID } from "./constants.js";
import {
  canSeeOverlay,
  clientLanguage,
  cueText,
  findCueIndex,
  getTrack,
  hasKaraoke,
  lineVisibility,
  localize,
  mergeDisplay,
  playbackTime,
  resolveFontFamily,
  resolveLanguageRoles,
  resolveLocation,
  swapClientLanguages
} from "./data.js";
import { ensureFonts } from "./fonts.js";

class KaraokeOverlay {
  #root = null;
  #box = null;
  #bar = null;
  #prev = null;
  #current = null;
  #next = null;
  #raf = 0;
  #previewUntil = 0;
  #previewDisplay = null;
  #previewLines = null;
  #track = null;

  mount() {
    if (this.#root?.isConnected) return;
    this.#root = document.createElement("div");
    this.#root.id = "foundry-karaoke-overlay";
    this.#root.className = "fk-overlay fk-hidden";
    this.#root.innerHTML = `
      <div class="fk-lyric-box">
        <div class="fk-line fk-prev">
          <div class="fk-ref"></div>
          <div class="fk-main"></div>
        </div>
        <div class="fk-line fk-current" aria-live="polite">
          <div class="fk-ref"></div>
          <div class="fk-main"></div>
        </div>
        <div class="fk-line fk-next">
          <div class="fk-ref"></div>
          <div class="fk-main"></div>
        </div>
      </div>
      <div class="fk-lang-bar">
        <label>${localize("MainLanguage")}
          <select data-role="main"></select>
        </label>
        <label>${localize("SecondaryLanguage")}
          <select data-role="secondary"></select>
        </label>
        <button type="button" data-action="swap">${localize("SwapLanguages")}</button>
      </div>
    `;
    document.body.appendChild(this.#root);
    this.#box = this.#root.querySelector(".fk-lyric-box");
    this.#bar = this.#root.querySelector(".fk-lang-bar");
    this.#prev = this.#root.querySelector(".fk-prev");
    this.#current = this.#root.querySelector(".fk-current");
    this.#next = this.#root.querySelector(".fk-next");
    this.#bar.addEventListener("change", this.#onBarChange);
    this.#bar.addEventListener("click", this.#onBarClick);
    this.#loop();
  }

  unmount() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#root?.remove();
    this.#root = null;
  }

  showPreview(display, lines, durationMs = 4000, track = null) {
    this.mount();
    this.#previewDisplay = mergeDisplay(display);
    this.#previewLines = lines;
    this.#track = track;
    this.#previewUntil = performance.now() + durationMs;
    this.#render(this.#previewDisplay, lines.prev, lines.current, lines.next, track);
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
      this.#render(this.#previewDisplay, lines.prev, lines.current, lines.next, this.#track);
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
    this.#track = track;
    const time = playbackTime(active);
    const index = findCueIndex(track.cues, time);
    if (index < 0) {
      this.#hide();
      return;
    }

    const roles = resolveLanguageRoles(track);
    const visible = lineVisibility(track.display);
    const prevCue = visible.previous ? track.cues[index - 1] : null;
    const nextCue = visible.next ? track.cues[index + 1] : null;
    this.#render(
      track.display,
      asLine(prevCue, roles),
      asLine(track.cues[index], roles),
      asLine(nextCue, roles),
      track
    );
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

  #render(display, prev, current, next, track = null) {
    const roles = track ? resolveLanguageRoles(track) : null;
    ensureFonts(display, roles?.languages ?? []);
    const loc = resolveLocation(display);
    const visible = lineVisibility(display);
    const showRef = Boolean(roles?.showSecondary ?? visible.reference);
    const size = Number(display.fontSize) || 42;
    const outline = Number(display.outlineWidth) || 0;
    const scale = Math.max(30, Math.min(90, Number(display.referenceScale) || 55));
    this.#root.classList.remove("fk-hidden");
    this.#root.classList.toggle("fk-dual", showRef);
    this.#box.style.left = `${loc.x}%`;
    this.#box.style.top = `${loc.y}%`;
    this.#box.style.width = `${Number(display.maxWidth) || 80}%`;
    this.#box.style.textAlign = display.textAlign || "center";
    this.#box.style.fontFamily = resolveFontFamily(display, "main", roles?.main);
    this.#box.style.fontSize = `${size}px`;
    this.#box.style.color = display.fontColor || "#fff";
    this.#box.style.setProperty("--fk-highlight", display.highlightColor || "#ffe082");
    this.#box.style.setProperty("--fk-outline", display.outlineColor || "#000");
    this.#box.style.setProperty("--fk-outline-width", `${outline}px`);
    this.#box.style.setProperty("--fk-ref-font", resolveFontFamily(display, "ref", roles?.secondary));
    this.#box.style.setProperty("--fk-ref-scale", `${scale}%`);
    this.#box.style.setProperty("--fk-ref-color", display.referenceColor || "#f3e5ab");
    this.#fillLine(this.#prev, prev, showRef);
    this.#fillLine(this.#current, current, showRef);
    this.#fillLine(this.#next, next, showRef);
    this.#syncBar(track, roles);
  }

  #syncBar(track, roles) {
    if (!this.#bar) return;
    const languages = track?.languages ?? [];
    const show = game.settings.get(MODULE_ID, "showLangBar") !== false && languages.length > 1 && !this.#root.classList.contains("fk-hidden");
    this.#bar.classList.toggle("fk-hidden", !show);
    if (!show || !roles) return;
    const mainSelect = this.#bar.querySelector('select[data-role="main"]');
    const secondarySelect = this.#bar.querySelector('select[data-role="secondary"]');
    fillSelect(mainSelect, languages, roles.mainId, false);
    fillSelect(secondarySelect, languages, roles.secondaryId || "off", true);
  }

  #onBarChange = (event) => {
    const select = event.target.closest("select");
    if (!select || !this.#track) return;
    if (select.dataset.role === "main") {
      const previousMain = resolveLanguageRoles(this.#track).mainId;
      clientLanguage.mainId = select.value;
      if (clientLanguage.secondaryId === select.value || resolveLanguageRoles(this.#track).secondaryId === select.value) {
        clientLanguage.secondaryId = previousMain;
      }
    }
    if (select.dataset.role === "secondary") clientLanguage.secondaryId = select.value;
    this.#tick();
  };

  #onBarClick = (event) => {
    const button = event.target.closest("[data-action='swap']");
    if (!button || !this.#track) return;
    swapClientLanguages(this.#track);
    this.#tick();
  };

  #fillLine(el, line, showRef) {
    const packed = typeof line === "string" ? { text: line, ref: "" } : (line ?? { text: "", ref: "" });
    const refEl = el.querySelector(".fk-ref");
    const mainEl = el.querySelector(".fk-main");
    const text = packed.text || "";
    const ref = showRef ? packed.ref || "" : "";
    if (refEl) refEl.textContent = ref;
    if (mainEl) mainEl.textContent = text;
    el.classList.toggle("fk-empty", !text && !ref);
  }

  #hide() {
    this.#root?.classList.add("fk-hidden");
    this.#bar?.classList.add("fk-hidden");
  }
}

function asLine(cue, roles) {
  if (!cue) return { text: "", ref: "" };
  return {
    text: cueText(cue, roles?.mainId) || cue.text || "",
    ref: roles?.secondaryId ? cueText(cue, roles.secondaryId) : ""
  };
}

function fillSelect(select, languages, selected, includeOff) {
  if (!select) return;
  const current = select.value;
  const html = [
    includeOff ? `<option value="off">${localize("SecondaryOff")}</option>` : "",
    ...languages.map((lang) => `<option value="${lang.id}">${lang.label || lang.id}</option>`)
  ].join("");
  if (select.dataset.html !== html) {
    select.innerHTML = html;
    select.dataset.html = html;
  }
  select.value = selected || current || languages[0]?.id || "";
}

export const overlay = new KaraokeOverlay();
export { MODULE_ID };
