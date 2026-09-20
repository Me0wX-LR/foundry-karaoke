import { MODULE_ID, FONT_PRESETS, LOCATION_PRESETS } from "./constants.js";
import { KaraokeManager } from "./apps.js";

const { ApplicationV2 } = foundry.applications.api;

export function registerSettings() {
  game.settings.register(MODULE_ID, "audience", {
    name: "KARAOKE.Audience",
    scope: "world",
    config: true,
    type: String,
    default: "all",
    choices: {
      all: "KARAOKE.AudienceAll",
      gm: "KARAOKE.AudienceGM",
      players: "KARAOKE.AudiencePlayers"
    }
  });

  game.settings.register(MODULE_ID, "defaultFontPreset", {
    name: "KARAOKE.DefaultFont",
    scope: "world",
    config: true,
    type: String,
    default: "cinzel",
    choices: Object.fromEntries(FONT_PRESETS.filter((f) => f.id !== "custom" && f.id !== "file").map((f) => [f.id, f.label]))
  });

  game.settings.register(MODULE_ID, "defaultLocationPreset", {
    name: "KARAOKE.DefaultLocation",
    scope: "world",
    config: true,
    type: String,
    default: "bottom",
    choices: Object.fromEntries(LOCATION_PRESETS.filter((p) => p.id !== "custom").map((p) => [p.id, p.label]))
  });

  game.settings.register(MODULE_ID, "hideOverlay", {
    name: "KARAOKE.HideOverlay",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "showPreviousLine", {
    name: "KARAOKE.ShowPreviousLine",
    hint: "KARAOKE.SurroundingHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "showNextLine", {
    name: "KARAOKE.ShowNextLine",
    hint: "KARAOKE.SurroundingHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "showReferenceLine", {
    name: "KARAOKE.ShowReferenceLine",
    hint: "KARAOKE.ShowSecondaryHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "showLangBar", {
    name: "KARAOKE.ShowLangBar",
    hint: "KARAOKE.ShowLangBarHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "langBarLeft", {
    scope: "client",
    config: false,
    type: Number,
    default: -1
  });

  game.settings.register(MODULE_ID, "langBarTop", {
    scope: "client",
    config: false,
    type: Number,
    default: -1
  });

  game.settings.registerMenu(MODULE_ID, "manager", {
    name: "KARAOKE.OpenManager",
    label: "KARAOKE.OpenManagerLabel",
    hint: "KARAOKE.OpenManagerHint",
    icon: "fa-solid fa-microphone-lines",
    type: KaraokeSettingsMenu,
    restricted: true
  });
}

class KaraokeSettingsMenu extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "foundry-karaoke-settings-menu",
    window: {
      title: "KARAOKE.ManagerTitle",
      icon: "fa-solid fa-microphone-lines"
    }
  };

  async render() {
    KaraokeManager.toggle();
    return this;
  }
}

export function registerSceneControls() {
  Hooks.on("getSceneControlButtons", (controls) => {
    const group = controls.sounds ?? controls.tokens;
    if (!group?.tools) return;
    group.tools.foundryKaraoke = {
      name: "foundryKaraoke",
      title: "KARAOKE.ManagerTitle",
      icon: "fa-solid fa-microphone-lines",
      button: true,
      visible: game.user.isGM,
      order: Object.keys(group.tools).length,
      onChange: () => KaraokeManager.toggle()
    };
  });
}
