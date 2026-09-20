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
6. Paste LRC lyrics, or play the track and use **Insert timestamp at playhead**.
7. Save, then play the playlist sound. Timed lines appear on the table for connected clients.

Right-click a playlist sound → **Edit Karaoke** jumps straight to that track.

## JSON import / export

- **Export JSON** in the manager writes every karaoke track in the world.
- **Export this track** in the editor writes one track.
- **Import JSON** matches tracks by playlist/sound id, then file path, then playlist + sound name.

Pack shape (see `examples/karaoke-pack.example.json`):

```json
{
  "schema": "foundry-karaoke",
  "version": 1,
  "tracks": [
    {
      "playlistName": "Tavern Songs",
      "soundName": "Ballad",
      "soundPath": "music/tavern/ballad.ogg",
      "enabled": true,
      "display": {
        "fontPreset": "cinzel",
        "fontSize": 42,
        "locationPreset": "bottom",
        "x": 50,
        "y": 88
      },
      "lrc": "[00:12.00]First line\n[00:16.40]Second line"
    }
  ]
}
```

LRC timestamps use `[mm:ss.xx]`. An optional end time is `[start][end]Line`.

## Settings

| Setting | Scope | Purpose |
| --- | --- | --- |
| Who sees karaoke | World | Everyone / GM only / players only |
| Default font | World | Used for newly enabled tracks |
| Default location | World | Used for newly enabled tracks |
| Hide overlay | Client | Turns off lyrics on this computer |

## API

After `ready`:

```js
game.modules.get("foundry-karaoke").api.openManager();
```

Also available as `foundryKaraoke`.
