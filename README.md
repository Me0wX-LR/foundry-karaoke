# Foundry Karaoke

A Foundry Virtual Tabletop **v14** module that adds karaoke lyrics to **selected playlist tracks**. You pick the **font** and **on-screen location**, then **export / import** the pack as JSON.

## Install

In Foundry Setup → **Add-on Modules** → **Install Module**, paste this manifest URL:

```
https://github.com/Me0wX-LR/foundry-karaoke/releases/latest/download/module.json
```

Or copy the folder to `{User Data}/Data/modules/foundry-karaoke` (the folder name must stay `foundry-karaoke`), then reload Setup and enable **Foundry Karaoke** in the world.

Typical Windows user data path:

`%localappdata%\FoundryVTT\Data\modules\foundry-karaoke`

## Use

1. Open **Karaoke Manager**:
   - Ambient Sound scene controls (microphone button), or
   - Playlists directory header, or
   - Configure Settings → Foundry Karaoke → Open Manager
2. Choose a track and click **Edit**.
3. Enable karaoke for that track.
4. Set **font type** (Foundry fonts, Google families, custom CSS family, or an uploaded `.ttf` / `.otf` / `.woff2`).
5. Set **location** with presets (top / center / bottom / …) or drag the sample lyric on the stage. X/Y are percent of the screen.
6. Add **languages** (Traditional Chinese, Japanese, English, …). Set **Main language** (large) and **Secondary language** (smaller, on top). Players can swap those from the on-table language bar.
7. Choose whether **previous** and **next** lines appear for this track. Each player can also hide those lines in Configure Settings.
8. Save, then play the playlist sound. Timed lines appear on the table for connected clients.

Right-click a playlist sound → **Edit Karaoke** jumps straight to that track.

## JSON import / export

- **Export JSON** in the manager writes every karaoke track in the world.
- **Export this track** in the editor writes one track.
- **Import JSON** matches tracks by playlist/sound id, then file path, then playlist + sound name.

Machine-readable schema: [`schema/karaoke-pack.schema.json`](schema/karaoke-pack.schema.json).

Older packs with only `lrc` / `lrcRef` still import. Prefer `languages` plus `cues[].texts`.

### Pack example

```json
{
  "schema": "foundry-karaoke",
  "version": 3,
  "tracks": [
    {
      "playlistName": "Tavern Songs",
      "soundName": "Ballad",
      "soundPath": "music/tavern/ballad.ogg",
      "enabled": true,
      "display": {
        "mainLanguage": "zh-Hant",
        "secondaryLanguage": "ja",
        "showSecondary": true,
        "showPrevious": true,
        "showNext": true,
        "locationPreset": "bottom",
        "x": 50,
        "y": 88
      },
      "languages": [
        { "id": "zh-Hant", "label": "Traditional Chinese", "fontPreset": "noto-sans-tc", "lrc": "[00:12.00]第一句繁中" },
        { "id": "ja", "label": "Japanese", "fontPreset": "noto-sans-jp", "lrc": "[00:12.00]日本語の一行目" },
        { "id": "en", "label": "English", "fontPreset": "signika", "lrc": "[00:12.00]First English line" }
      ],
      "cues": [
        {
          "start": 12.0,
          "end": 16.4,
          "texts": {
            "zh-Hant": "第一句繁中",
            "ja": "日本語の一行目",
            "en": "First English line"
          }
        }
      ]
    }
  ]
}
```

Pair lines across languages with the same LRC timestamp, such as `[00:12.00]`.

### JSON Schema (draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Foundry Karaoke pack",
  "type": "object",
  "required": ["tracks"],
  "properties": {
    "schema": { "const": "foundry-karaoke" },
    "version": { "type": "integer", "minimum": 1, "description": "Pack format version. Current is 3." },
    "exportedAt": { "type": "string" },
    "tracks": {
      "type": "array",
      "items": { "$ref": "#/$defs/track" }
    }
  },
  "$defs": {
    "track": {
      "type": "object",
      "properties": {
        "playlistId": { "type": "string" },
        "playlistName": { "type": "string" },
        "soundId": { "type": "string" },
        "soundName": { "type": "string" },
        "soundPath": { "type": "string" },
        "enabled": { "type": "boolean" },
        "display": { "$ref": "#/$defs/display" },
        "languages": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/language" }
        },
        "cues": {
          "type": "array",
          "items": { "$ref": "#/$defs/cue" }
        },
        "lrc": { "type": "string", "description": "Legacy main LRC, used if languages is omitted." },
        "lrcRef": { "type": "string", "description": "Legacy secondary LRC, used if languages is omitted." }
      }
    },
    "language": {
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": { "type": "string", "description": "Stable key, e.g. zh-Hant, ja, en. Used in cues.texts and display.mainLanguage." },
        "label": { "type": "string" },
        "fontPreset": { "type": "string" },
        "lrc": { "type": "string", "description": "LRC for this language. Match timestamps across languages." }
      }
    },
    "cue": {
      "type": "object",
      "required": ["start"],
      "properties": {
        "start": { "type": "number", "minimum": 0, "description": "Start time in seconds." },
        "end": { "type": ["number", "null"], "minimum": 0 },
        "texts": {
          "type": "object",
          "description": "Map of language id → lyric line.",
          "additionalProperties": { "type": "string" }
        },
        "text": { "type": "string", "description": "Legacy main line." },
        "ref": { "type": "string", "description": "Legacy secondary line." }
      }
    },
    "display": {
      "type": "object",
      "properties": {
        "mainLanguage": { "type": "string", "description": "Language id for the large main line." },
        "secondaryLanguage": { "type": "string", "description": "Language id for the small top line. Empty disables it." },
        "showSecondary": { "type": "boolean" },
        "showPrevious": { "type": "boolean" },
        "showNext": { "type": "boolean" },
        "fontPreset": { "type": "string" },
        "fontSize": { "type": "number" },
        "fontColor": { "type": "string" },
        "highlightColor": { "type": "string" },
        "outlineColor": { "type": "string" },
        "outlineWidth": { "type": "number" },
        "locationPreset": { "enum": ["top", "upper", "center", "lower", "bottom", "custom"] },
        "x": { "type": "number", "minimum": 0, "maximum": 100 },
        "y": { "type": "number", "minimum": 0, "maximum": 100 },
        "maxWidth": { "type": "number" },
        "textAlign": { "enum": ["left", "center", "right"] },
        "referenceScale": { "type": "number", "minimum": 30, "maximum": 90 },
        "referenceColor": { "type": "string" }
      }
    }
  }
}
```


## Settings

| Setting | Scope | Purpose |
| --- | --- | --- |
| Who sees karaoke | World | Everyone / GM only / players only |
| Default font | World | Used for newly enabled tracks |
| Default location | World | Used for newly enabled tracks |
| Hide overlay | Client | Turns off lyrics on this computer |
| Show previous line | Client | Hide the previous lyric locally |
| Show next line | Client | Hide the next lyric locally |
| Show secondary language | Client | Hide the smaller top line locally |
| Show language toggle | Client | Show Main / Secondary dropdowns on the table |

## API

After `ready`:

```js
game.modules.get("foundry-karaoke").api.openManager();
```

Also available as `foundryKaraoke`.
