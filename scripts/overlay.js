import { MODULE_ID } from "./constants.js";
import {
  canSeeOverlay,
  canUseLanguageBar,
  cueText,
  findCueIndex,
  getTrack,
  hasKaraoke,
  lineVisibility,
  localize,
  mergeDisplay,
  playbackTime,
  publishLiveLanguage,
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
  #restore = null;
  #prev = null;
  #current = null;
  #next = null;
  #raf = 0;
  #previewUntil = 0;
  #previewDisplay = null;
  #previewLines = null;
  #track = null;
  #sound = null;
  #barHidden = false;
  #pos = { left: null, top: null };
  #drag = null;
  #ignoreRestoreClick = false;

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
        <button type="button" class="fk-lang-bar-grip" data-drag="lang" title="${localize("DragLangBar")}" aria-label="${localize("DragLangBar")}">
          <i class="fa-solid fa-grip-vertical"></i>
        </button>
        <label>${localize("MainLanguage")}
          <select data-role="main"></select>
        </label>
        <label>${localize("SecondaryLanguage")}
          <select data-role="secondary"></select>
        </label>
        <button type="button" data-action="swap">${localize("SwapLanguages")}</button>
        <button type="button" class="fk-lang-bar-close" data-action="dismiss" aria-label="${localize("MinimizeLangBar")}" title="${localize("MinimizeLangBar")}">
          <i class="fa-solid fa-minus"></i>
        </button>
      </div>
      <button type="button" class="fk-lang-bar-restore fk-hidden" data-action="restore" data-drag="lang" title="${localize("OpenLangBar")}" aria-label="${localize("OpenLangBar")}">
        <i class="fa-solid fa-language"></i>
      </button>
    `;
    document.body.appendChild(this.#root);
    this.#box = this.#root.querySelector(".fk-lyric-box");
    this.#bar = this.#root.querySelector(".fk-lang-bar");
    this.#restore = this.#root.querySelector(".fk-lang-bar-restore");
    this.#prev = this.#root.querySelector(".fk-prev");
    this.#current = this.#root.querySelector(".fk-current");
    this.#next = this.#root.querySelector(".fk-next");
    this.#root.addEventListener("change", this.#onBarChange);
    this.#root.addEventListener("click", this.#onBarClick);
    this.#root.addEventListener("pointerdown", this.#onBarPointerDown);
    try {
      this.#barHidden = game.settings.get(MODULE_ID, "showLangBar") === false;
      const left = Number(game.settings.get(MODULE_ID, "langBarLeft"));
      const top = Number(game.settings.get(MODULE_ID, "langBarTop"));
      this.#pos = left >= 0 && top >= 0 ? { left, top } : { left: null, top: null };
    } catch {
      this.#barHidden = false;
      this.#pos = { left: null, top: null };
    }
    this.#applyBarPosition();
    this.#loop();
  }

  unmount() {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#endDrag();
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
    this.#sound = active;
    const time = playbackTime(active);
    const index = findCueIndex(track.cues, time);
    if (index < 0) {
      this.#hide();
      return;
    }

    const roles = resolveLanguageRoles(track, active);
    const visible = lineVisibility(track.display, track, active);
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
    const roles = track ? resolveLanguageRoles(track, this.#sound) : null;
    ensureFonts(display, roles?.languages ?? []);
    const loc = resolveLocation(display);
    const visible = lineVisibility(display, track, this.#sound);
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
    const overlayOn = !this.#root.classList.contains("fk-hidden");
    const multi = languages.length > 1;
    const allowed = canUseLanguageBar();
    const settingOn = !this.#barHidden;
    const showBar = overlayOn && multi && allowed && settingOn;
    const showRestore = overlayOn && multi && allowed && !settingOn;
    this.#bar.classList.toggle("fk-hidden", !showBar);
    this.#restore?.classList.toggle("fk-hidden", !showRestore);
    this.#applyBarPosition();
    if (!showBar || !roles) return;
    const mainSelect = this.#bar.querySelector('select[data-role="main"]');
    const secondarySelect = this.#bar.querySelector('select[data-role="secondary"]');
    fillSelect(mainSelect, languages, roles.mainId, false);
    fillSelect(secondarySelect, languages, roles.secondaryChoice || "off", true);
  }

  #applyBarPosition() {
    const moved = this.#pos.left != null && this.#pos.top != null;
    for (const el of [this.#bar, this.#restore]) {
      if (!el) continue;
      el.classList.toggle("fk-lang-moved", moved);
      if (!moved) {
        el.style.left = "";
        el.style.top = "";
        continue;
      }
      el.style.left = `${this.#pos.left}%`;
      el.style.top = `${this.#pos.top}%`;
    }
  }

  #onBarPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    const grip = event.target.closest("[data-drag='lang']");
    if (!grip) return;
    if (event.target.closest("select, option")) return;
    const el = event.target.closest(".fk-lang-bar-restore") || this.#bar;
    if (!el || el.classList.contains("fk-hidden")) return;
    if (!el.classList.contains("fk-lang-bar-restore")) event.preventDefault();
    const rect = el.getBoundingClientRect();
    this.#drag = {
      el,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      isMini: el.classList.contains("fk-lang-bar-restore")
    };
    el.classList.add("fk-lang-dragging");
    el.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", this.#onBarPointerMove);
    window.addEventListener("pointerup", this.#onBarPointerUp);
    window.addEventListener("pointercancel", this.#onBarPointerUp);
  };

  #onBarPointerMove = (event) => {
    if (!this.#drag) return;
    const dist = Math.hypot(event.clientX - this.#drag.startX, event.clientY - this.#drag.startY);
    if (dist > 5) this.#drag.moved = true;
    if (!this.#drag.moved) return;
    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const size = this.#drag.el.getBoundingClientRect();
    const leftPx = Math.max(8, Math.min(vw - size.width - 8, event.clientX - this.#drag.dx));
    const topPx = Math.max(8, Math.min(vh - size.height - 8, event.clientY - this.#drag.dy));
    this.#pos = {
      left: (leftPx / vw) * 100,
      top: (topPx / vh) * 100
    };
    this.#applyBarPosition();
  };

  #onBarPointerUp = () => {
    if (!this.#drag) return;
    if (this.#drag.isMini && this.#drag.moved) this.#ignoreRestoreClick = true;
    this.#endDrag();
    this.#savePos();
  };

  #endDrag() {
    this.#drag?.el?.classList.remove("fk-lang-dragging");
    this.#drag = null;
    window.removeEventListener("pointermove", this.#onBarPointerMove);
    window.removeEventListener("pointerup", this.#onBarPointerUp);
    window.removeEventListener("pointercancel", this.#onBarPointerUp);
  }

  #savePos() {
    if (this.#pos.left == null || this.#pos.top == null) return;
    try {
      game.settings.set(MODULE_ID, "langBarLeft", this.#pos.left);
      game.settings.set(MODULE_ID, "langBarTop", this.#pos.top);
    } catch {
      /* settings not ready */
    }
  }

  #onBarChange = (event) => {
    const select = event.target.closest("select");
    if (!select || !this.#track) return;
    const roles = resolveLanguageRoles(this.#track, this.#sound);
    let mainId = roles.mainId;
    let secondaryId = roles.secondaryChoice || "off";
    if (select.dataset.role === "main") {
      const previousMain = mainId;
      mainId = select.value;
      if (secondaryId === mainId) secondaryId = previousMain;
    }
    if (select.dataset.role === "secondary") secondaryId = select.value;
    publishLiveLanguage(this.#sound, mainId, secondaryId);
    this.#tick();
  };

  #onBarClick = (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "dismiss") {
      event.preventDefault();
      event.stopPropagation();
      this.#barHidden = true;
      this.#bar?.classList.add("fk-hidden");
      this.#restore?.classList.remove("fk-hidden");
      this.#applyBarPosition();
      game.settings.set(MODULE_ID, "showLangBar", false);
      return;
    }
    if (action === "restore") {
      event.preventDefault();
      event.stopPropagation();
      if (this.#ignoreRestoreClick) {
        this.#ignoreRestoreClick = false;
        return;
      }
      this.#barHidden = false;
      this.#restore?.classList.add("fk-hidden");
      this.#bar?.classList.remove("fk-hidden");
      game.settings.set(MODULE_ID, "showLangBar", true);
      this.#tick();
      return;
    }
    if (action !== "swap" || !this.#track) return;
    swapClientLanguages(this.#track, this.#sound);
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
    this.#restore?.classList.add("fk-hidden");
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
