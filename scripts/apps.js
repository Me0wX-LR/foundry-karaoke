import { MODULE_ID, FONT_PRESETS, LANGUAGE_PRESETS, LOCATION_PRESETS, defaultLanguage } from "./constants.js";
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
    constrainAppToViewport(this);
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
    position: { width: 780, height: 720 },
    actions: {
      pickFontFile: this.onPickFontFile,
      setLocation: this.onSetLocation,
      stamp: this.onStamp,
      stampAll: this.onStampAll,
      addLanguage: this.onAddLanguage,
      removeLanguage: this.onRemoveLanguage,
      swapRoles: this.onSwapRoles,
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
      scrollable: [".fk-editor-scroll"]
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
      languages: track.languages.map((lang, index) => ({
        ...lang,
        index,
        fontPresets: FONT_PRESETS.filter((f) => f.id !== "file").map((f) => ({
          ...f,
          selected: f.id === lang.fontPreset
        }))
      })),
      languageOptions: track.languages.map((lang) => ({
        id: lang.id,
        label: lang.label,
        mainSelected: lang.id === display.mainLanguage,
        secondarySelected: lang.id === display.secondaryLanguage
      })),
      languagePresets: LANGUAGE_PRESETS,
      canRemoveLanguage: track.languages.length > 1,
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
    constrainAppToViewport(this, { scroll: ".fk-editor-scroll" });
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
      showNext: checked("showNext"),
      showSecondary: checked("showSecondary"),
      dualLanguage: checked("showSecondary"),
      mainLanguage: value("mainLanguage"),
      secondaryLanguage: value("secondaryLanguage"),
      referenceScale: Number(value("referenceScale")),
      referenceColor: value("referenceColor")
    });
  }

  refreshStage() {
    const display = this.formDisplay();
    const languages = this.readLanguages();
    ensureFonts(display, languages);
    const loc = resolveLocation(display);
    const stage = this.element.querySelector(".fk-stage-lyric");
    const main = this.element.querySelector(".fk-stage-main");
    const ref = this.element.querySelector(".fk-stage-ref");
    if (!stage) return;
    stage.style.left = `${loc.x}%`;
    stage.style.top = `${loc.y}%`;
    stage.style.width = `${display.maxWidth}%`;
    stage.style.textAlign = display.textAlign;
    stage.style.fontFamily = resolveFontFamily(display, "main");
    stage.style.fontSize = `${Math.max(12, Number(display.fontSize) * 0.35)}px`;
    stage.style.color = display.highlightColor || display.fontColor;
    stage.style.setProperty("--fk-ref-font", resolveFontFamily(display, "ref"));
    stage.style.setProperty("--fk-ref-scale", `${display.referenceScale || 55}%`);
    stage.style.setProperty("--fk-ref-color", display.referenceColor || "#f3e5ab");
    if (main) {
      const mainLang = this.readLanguages().find((lang) => lang.id === display.mainLanguage);
      main.textContent = mainLang?.label || localize("SampleCurrent");
      stage.style.fontFamily = resolveFontFamily(display, "main", mainLang);
    }
    if (ref) {
      const secondaryLang = this.readLanguages().find((lang) => lang.id === display.secondaryLanguage);
      const show = Boolean(display.showSecondary && display.secondaryLanguage);
      ref.textContent = show ? (secondaryLang?.label || localize("SampleCurrentRef")) : "";
      ref.hidden = !show;
      stage.style.setProperty("--fk-ref-font", resolveFontFamily(display, "ref", secondaryLang));
    }
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

  readLanguages() {
    const languages = [];
    this.element.querySelectorAll(".fk-language").forEach((article, index) => {
      languages.push({
        id: article.querySelector(`[name="lang.${index}.id"]`)?.value,
        label: article.querySelector(`[name="lang.${index}.label"]`)?.value,
        fontPreset: article.querySelector(`[name="lang.${index}.fontPreset"]`)?.value,
        lrc: article.querySelector(`[name="lang.${index}.lrc"]`)?.value ?? ""
      });
    });
    return languages;
  }

  readTrack() {
    const display = this.formDisplay();
    const languages = this.readLanguages();
    return mergeTrack({
      enabled: this.element.querySelector('[name="enabled"]')?.checked ?? true,
      display,
      languages
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

  static async onStamp(_event, target) {
    const index = target?.dataset?.index ?? "0";
    const area = this.element.querySelector(`[name="lang.${index}.lrc"]`)
      || this.element.querySelector("textarea:focus")
      || this.element.querySelector("textarea");
    if (!area) return;
    const stamp = `[${formatStamp(playbackTime(this.sound))}]`;
    const start = area.selectionStart ?? area.value.length;
    area.setRangeText(`${stamp}`, start, area.selectionEnd ?? start, "end");
    area.focus();
  }

  static async onStampAll() {
    const stamp = `[${formatStamp(playbackTime(this.sound))}]`;
    this.element.querySelectorAll("textarea[name$='.lrc']").forEach((area) => {
      const start = area.selectionStart ?? area.value.length;
      area.setRangeText(`${stamp}`, start, area.selectionEnd ?? start, "end");
    });
  }

  static async onAddLanguage() {
    const track = this.readTrack();
    const presetId = this.element.querySelector('[name="addLanguagePreset"]')?.value;
    const preset = LANGUAGE_PRESETS.find((p) => p.id === presetId);
    const next = preset ? { ...preset, lrc: "" } : defaultLanguage(track.languages.length);
    if (track.languages.some((lang) => lang.id === next.id)) next.id = `${next.id}-${track.languages.length + 1}`;
    track.languages.push(next);
    if (track.languages.length > 1 && !track.display.secondaryLanguage) {
      track.display.secondaryLanguage = next.id;
      track.display.showSecondary = true;
    }
    const merged = mergeTrack(track);
    await setTrack(this.sound, merged);
    this.render({ force: true });
  }

  static async onRemoveLanguage(_event, target) {
    const track = this.readTrack();
    const index = Number(target.dataset.index);
    if (!Number.isFinite(index) || track.languages.length < 2) return;
    track.languages.splice(index, 1);
    const merged = mergeTrack(track);
    await setTrack(this.sound, merged);
    this.render({ force: true });
  }

  static async onSwapRoles() {
    const main = this.element.querySelector('[name="mainLanguage"]');
    const secondary = this.element.querySelector('[name="secondaryLanguage"]');
    if (!main || !secondary || !secondary.value) return;
    const previousMain = main.value;
    main.value = secondary.value;
    secondary.value = previousMain;
    const show = this.element.querySelector('[name="showSecondary"]');
    if (show) show.checked = true;
    this.refreshStage();
  }

  static async onPlayTrack() {
    await this.sound.parent?.playSound(this.sound);
  }

  static async onStopTrack() {
    await this.sound.parent?.stopSound(this.sound);
  }

  static async onPreviewTable() {
    const track = this.readTrack();
    const display = track.display;
    const showSecondary = Boolean(display.showSecondary && display.secondaryLanguage);
    overlay.showPreview(display, {
      prev: display.showPrevious
        ? { text: localize("SamplePrev"), ref: showSecondary ? localize("SamplePrevRef") : "" }
        : { text: "", ref: "" },
      current: {
        text: localize("SampleCurrent"),
        ref: showSecondary ? localize("SampleCurrentRef") : ""
      },
      next: display.showNext
        ? { text: localize("SampleNext"), ref: showSecondary ? localize("SampleNextRef") : "" }
        : { text: "", ref: "" }
    }, 4000, track);
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

function constrainAppToViewport(app, { scroll } = {}) {
  const el = app.element;
  if (!el) return;
  const cap = Math.max(400, (globalThis.innerHeight ?? 900) - 36);
  const nextHeight = Math.min(app.position.height || 720, cap);
  if ((app.position.height ?? 0) !== nextHeight) app.setPosition({ height: nextHeight });
  el.style.maxHeight = `${cap}px`;
  el.style.height = `${nextHeight}px`;
  el.style.overflow = "hidden";
  const content = el.querySelector(".window-content") || app.window?.content;
  if (content) {
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.flex = "1 1 auto";
    content.style.minHeight = "0";
    content.style.overflow = "hidden";
  }
  const editor = el.querySelector(".fk-editor") || el.querySelector(".fk-manager");
  if (editor) {
    editor.style.display = "flex";
    editor.style.flexDirection = "column";
    editor.style.flex = "1 1 auto";
    editor.style.minHeight = "0";
    editor.style.overflow = "hidden";
    editor.style.height = "100%";
  }
  const scroller = (scroll && el.querySelector(scroll)) || content;
  if (scroller) {
    scroller.style.flex = "1 1 auto";
    scroller.style.minHeight = "0";
    scroller.style.maxHeight = "100%";
    scroller.style.overflowX = "hidden";
    scroller.style.overflowY = "auto";
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
