import { MODULE_ID, FONT_PRESETS, LOCATION_PRESETS } from "./constants.js";
import {
  FilePickerClass,
  buildExportPack,
  collectKaraokeSounds,
  findMatchingSound,
  formatStamp,
  getTrack,
  importTracks,
  localize,
  mergeDisplay,
  mergeTrack,
  newTrackFromSettings,
  parseImportPayload,
  parseLrc,
  pickLocalJsonFile,
  playbackTime,
  resolveFontFamily,
  resolveLocation,
  saveJsonFile,
  setTrack
} from "./data.js";
import { overlay } from "./overlay.js";
import { ensureFonts } from "./fonts.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class KaraokeManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "foundry-karaoke-manager",
    classes: ["foundry-karaoke", "fk-manager-app"],
    tag: "div",
    window: {
      title: "KARAOKE.ManagerTitle",
      icon: "fa-solid fa-microphone-lines",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: { width: 720, height: 640 },
    actions: {
      editTrack: this.onEditTrack,
      toggleEnabled: this.onToggleEnabled,
      exportAll: this.onExportAll,
      importJson: this.onImportJson,
      filterKaraoke: this.onFilterKaraoke
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/manager.hbs`,
      root: true,
      scrollable: [".fk-track-list"]
    }
  };

  query = "";
  karaokeOnly = false;

  static toggle() {
    const existing = foundry.applications.instances.get("foundry-karaoke-manager");
    if (existing) return existing.close();
    return new KaraokeManager().render({ force: true });
  }

  async _prepareContext() {
    const playlists = [];
    for (const playlist of game.playlists) {
      const sounds = [];
      for (const sound of playlist.sounds) {
        const track = getTrack(sound);
        sounds.push({
          id: sound.id,
          uuid: sound.uuid,
          name: sound.name,
          enabled: Boolean(track?.enabled),
          hasData: Boolean(track),
          cueCount: track?.cues?.length ?? 0
        });
      }
      if (!sounds.length) continue;
      playlists.push({ id: playlist.id, name: playlist.name, sounds });
    }
    return {
      query: this.query,
      karaokeOnly: this.karaokeOnly,
      playlists,
      empty: !game.playlists.size,
      noMatches: false
    };
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    const search = this.element.querySelector('[name="query"]');
    if (search) {
      search.value = this.query;
      search.addEventListener("input", (event) => {
        this.query = event.currentTarget.value;
        this.applyListFilter();
      });
    }
    this.applyListFilter();
  }

  applyListFilter() {
    const q = this.query.trim().toLowerCase();
    this.element.querySelectorAll(".fk-playlist").forEach((playlist) => {
      let visible = 0;
      playlist.querySelectorAll(".fk-sound").forEach((row) => {
        const name = `${playlist.dataset.name ?? ""} ${row.dataset.name ?? ""}`.toLowerCase();
        const karaoke = row.dataset.hasKaraoke === "true";
        const show = (!q || name.includes(q)) && (!this.karaokeOnly || karaoke);
        row.hidden = !show;
        if (show) visible += 1;
      });
      playlist.hidden = visible === 0;
    });
  }

  static async onFilterKaraoke(_event, target) {
    this.karaokeOnly = Boolean(target.checked);
    this.applyListFilter();
  }

  static async onEditTrack(_event, target) {
    const sound = await fromUuid(target.dataset.uuid);
    if (!sound) return ui.notifications.warn(localize("MissingSound"));
    KaraokeEditor.open(sound);
  }

  static async onToggleEnabled(event, target) {
    event.preventDefault();
    const sound = await fromUuid(target.dataset.uuid);
    if (!sound) return;
    const current = getTrack(sound) ?? { ...newTrackFromSettings(), enabled: false };
    current.enabled = !current.enabled;
    await setTrack(sound, current);
    this.render({ force: true });
  }

  static async onExportAll() {
    const rows = collectKaraokeSounds();
    if (!rows.length) return ui.notifications.warn(localize("NothingToExport"));
    saveJsonFile(buildExportPack(rows), "foundry-karaoke.json");
    ui.notifications.info(localize("Exported", { n: rows.length }));
  }

  static async onImportJson() {
    if (!game.user.isGM) return ui.notifications.warn(localize("NeedGM"));
    const raw = await pickLocalJsonFile();
    if (!raw) return;
    const tracks = parseImportPayload(raw);
    if (!tracks) return ui.notifications.error(localize("ImportInvalid"));
    const result = await importTracks(tracks);
    notifyImport(result);
    this.render({ force: true });
  }
}

export class KaraokeEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["foundry-karaoke", "fk-editor-app"],
    tag: "form",
    form: {
      handler: this.onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    },
    window: {
      title: "KARAOKE.EditorTitle",
      icon: "fa-solid fa-microphone-lines",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: { width: 780, height: 760 },
    actions: {
      pickFontFile: this.onPickFontFile,
      setLocation: this.onSetLocation,
      stamp: this.onStamp,
      playTrack: this.onPlayTrack,
      stopTrack: this.onStopTrack,
      previewTable: this.onPreviewTable,
      exportTrack: this.onExportTrack,
      importTrack: this.onImportTrack,
      saveClose: this.onSaveClose
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/editor.hbs`,
      root: true,
      scrollable: [""]
    }
  };

  /** @type {PlaylistSound} */
  sound;
  playheadRaf = 0;

  constructor(options) {
    const sound = options.sound;
    super({
      ...options,
      id: `foundry-karaoke-editor-${sound?.id ?? foundry.utils.randomID(8)}`
    });
    this.sound = sound;
  }

  static open(sound) {
    const id = `foundry-karaoke-editor-${sound.id}`;
    const existing = foundry.applications.instances.get(id);
    if (existing) return existing.render({ force: true });
    return new KaraokeEditor({ sound }).render({ force: true });
  }

  get title() {
    const base = localize("EditorTitle");
    return this.sound ? `${base}: ${this.sound.name}` : base;
  }

  async _prepareContext() {
    const stored = getTrack(this.sound) ?? newTrackFromSettings();
    const track = mergeTrack(stored);
    const display = mergeDisplay(track.display);
    return {
      playlistName: this.sound.parent?.name ?? "",
      soundName: this.sound.name,
      enabled: track.enabled,
      display,
      lrc: track.lrc || "",
      cueCount: track.cues.length,
      cueCountLabel: localize("CueCount", { n: track.cues.length }),
      fontPresets: FONT_PRESETS.map((f) => ({ ...f, selected: f.id === display.fontPreset })),
      locationPresets: LOCATION_PRESETS.map((p) => ({ ...p, selected: p.id === display.locationPreset })),
      alignLeft: display.textAlign === "left",
      alignCenter: display.textAlign === "center",
      alignRight: display.textAlign === "right",
      isCustomFont: display.fontPreset === "custom",
      isFileFont: display.fontPreset === "file"
    };
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    this.bindLivePreview();
    this.bindStageDrag();
    this.startPlayhead();
  }

  async _onClose(options) {
    cancelAnimationFrame(this.playheadRaf);
    this.playheadRaf = 0;
    return super._onClose(options);
  }

  formDisplay() {
    const form = this.element;
    if (!form) return mergeDisplay();
    const value = (name) => form.querySelector(`[name="${name}"]`)?.value;
    const checked = (name) => Boolean(form.querySelector(`[name="${name}"]`)?.checked);
    const locationPreset = value("locationPreset") || "custom";
    const loc = resolveLocation({
      locationPreset,
      x: Number(value("x")),
      y: Number(value("y"))
    });
    return mergeDisplay({
      fontPreset: value("fontPreset"),
      customFamily: value("customFamily"),
      fontFile: value("fontFile"),
      fontSize: Number(value("fontSize")),
      fontColor: value("fontColor"),
      highlightColor: value("highlightColor"),
      outlineColor: value("outlineColor"),
      outlineWidth: Number(value("outlineWidth")),
      locationPreset: loc.preset,
      x: loc.x,
      y: loc.y,
      maxWidth: Number(value("maxWidth")),
      textAlign: value("textAlign"),
      showPrevious: checked("showPrevious"),
      showNext: checked("showNext")
    });
  }

  refreshStage() {
    const display = this.formDisplay();
    ensureFonts(display);
    const loc = resolveLocation(display);
    const stage = this.element.querySelector(".fk-stage-lyric");
    if (!stage) return;
    stage.style.left = `${loc.x}%`;
    stage.style.top = `${loc.y}%`;
    stage.style.width = `${display.maxWidth}%`;
    stage.style.textAlign = display.textAlign;
    stage.style.fontFamily = resolveFontFamily(display);
    stage.style.fontSize = `${Math.max(12, Number(display.fontSize) * 0.35)}px`;
    stage.style.color = display.highlightColor || display.fontColor;
    stage.textContent = localize("SampleCurrent");
    this.element.querySelectorAll("[data-location]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.location === display.locationPreset);
    });
    this.element.querySelector(".fk-custom-font")?.classList.toggle("hidden", display.fontPreset !== "custom");
    this.element.querySelector(".fk-file-font")?.classList.toggle("hidden", display.fontPreset !== "file");
  }

  bindLivePreview() {
    this.element.querySelectorAll("input, select, textarea").forEach((el) => {
      el.addEventListener("input", () => this.refreshStage());
      el.addEventListener("change", () => this.refreshStage());
    });
    this.refreshStage();
  }

  bindStageDrag() {
    const stage = this.element.querySelector(".fk-stage");
    const lyric = this.element.querySelector(".fk-stage-lyric");
    if (!stage || !lyric) return;
    let dragging = false;
    const move = (event) => {
      if (!dragging) return;
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      const xInput = this.element.querySelector('[name="x"]');
      const yInput = this.element.querySelector('[name="y"]');
      const preset = this.element.querySelector('[name="locationPreset"]');
      xInput.value = String(Math.round(Math.min(100, Math.max(0, x)) * 10) / 10);
      yInput.value = String(Math.round(Math.min(100, Math.max(0, y)) * 10) / 10);
      preset.value = "custom";
      this.refreshStage();
    };
    lyric.addEventListener("pointerdown", (event) => {
      dragging = true;
      lyric.setPointerCapture(event.pointerId);
      move(event);
    });
    lyric.addEventListener("pointermove", move);
    lyric.addEventListener("pointerup", () => {
      dragging = false;
    });
  }

  startPlayhead() {
    cancelAnimationFrame(this.playheadRaf);
    const tick = () => {
      if (!this.rendered) return;
      const label = this.element.querySelector(".fk-playhead");
      if (label && this.sound) label.textContent = formatStamp(playbackTime(this.sound));
      this.playheadRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  readTrack() {
    const display = this.formDisplay();
    const lrc = this.element.querySelector('[name="lrc"]')?.value ?? "";
    return mergeTrack({
      enabled: this.element.querySelector('[name="enabled"]')?.checked ?? true,
      display,
      lrc,
      cues: parseLrc(lrc)
    });
  }

  static async onPickFontFile() {
    const Picker = FilePickerClass();
    if (!Picker) return;
    const picker = new Picker({
      type: "font",
      current: this.element.querySelector('[name="fontFile"]')?.value || "",
      callback: (path) => {
        const input = this.element.querySelector('[name="fontFile"]');
        const preset = this.element.querySelector('[name="fontPreset"]');
        if (input) input.value = path;
        if (preset) preset.value = "file";
        this.refreshStage();
      }
    });
    picker.render({ force: true });
  }

  static async onSetLocation(_event, target) {
    const presetId = target.dataset.location;
    const preset = LOCATION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.element.querySelector('[name="locationPreset"]').value = preset.id;
    if (preset.id !== "custom") {
      this.element.querySelector('[name="x"]').value = String(preset.x);
      this.element.querySelector('[name="y"]').value = String(preset.y);
    }
    this.refreshStage();
  }

  static async onStamp() {
    const area = this.element.querySelector('[name="lrc"]');
    const stamp = `[${formatStamp(playbackTime(this.sound))}]`;
    const start = area.selectionStart ?? area.value.length;
    area.setRangeText(`${stamp}`, start, area.selectionEnd ?? start, "end");
    area.focus();
  }

  static async onPlayTrack() {
    await this.sound.parent?.playSound(this.sound);
  }

  static async onStopTrack() {
    await this.sound.parent?.stopSound(this.sound);
  }

  static async onPreviewTable() {
    const display = this.formDisplay();
    overlay.showPreview(display, {
      prev: localize("SamplePrev"),
      current: localize("SampleCurrent"),
      next: localize("SampleNext")
    });
    ui.notifications.info(localize("Previewing"));
  }

  static async onExportTrack() {
    const pack = buildExportPack([
      { playlist: this.sound.parent, sound: this.sound, track: this.readTrack() }
    ]);
    const slug = this.sound.name.replace(/[^\w-]+/g, "-").toLowerCase();
    saveJsonFile(pack, `foundry-karaoke-${slug}.json`);
    ui.notifications.info(localize("Exported", { n: 1 }));
  }

  static async onImportTrack() {
    const raw = await pickLocalJsonFile();
    if (!raw) return;
    const tracks = parseImportPayload(raw);
    if (!tracks?.length) return ui.notifications.error(localize("ImportInvalid"));
    const matched = tracks.find((entry) => findMatchingSound(entry)?.id === this.sound.id) ?? tracks[0];
    const result = await importTracks([matched], { targetSound: this.sound });
    notifyImport(result);
    this.render({ force: true });
  }

  static async onSaveClose(event) {
    await KaraokeEditor.onSubmit.call(this, event, this.element, null, { close: true });
  }

  static async onSubmit(event, _form, _formData, options = {}) {
    event?.preventDefault?.();
    if (!game.user.isGM) return ui.notifications.warn(localize("NeedGM"));
    if (!this.sound) return ui.notifications.warn(localize("MissingSound"));
    await setTrack(this.sound, this.readTrack());
    ui.notifications.info(localize("Saved"));
    if (options.close) return this.close();
    return this.render({ force: true });
  }
}

function notifyImport(result) {
  if (!result.ok && result.skip) {
    ui.notifications.warn(localize("ImportNone"));
    if (result.unmatched.length) {
      ui.notifications.warn(localize("Unmatched", { list: result.unmatched.join(", ") }));
    }
    return;
  }
  ui.notifications.info(localize("Imported", { ok: result.ok, skip: result.skip }));
  if (result.unmatched.length) {
    ui.notifications.warn(localize("Unmatched", { list: result.unmatched.join(", ") }));
  }
}
