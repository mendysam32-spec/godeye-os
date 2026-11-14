---
name: magic-drum
description: >
  Cinematic 2D/3D animated films from one film.json: stylized-PBR 3D characters with
  lip-synced neural voices, gestures, camera work, color grades, music and SFX.
  Trigger with /magicdrum or when the user asks for an animated film, cartoon, 3D short,
  animated story, or voice-over animation. Renders locally in minutes — no API keys.
version: 1.0.0
---

# Magic Drum

Turn a story into a finished animated film: **write one `film.json`, run one command.**
Free neural voices with word-timed lip-sync, procedural 3D characters with gestures,
film cameras, color grades, synthesized music, CC0 SFX, automatic audit.

## The 3-call flow (economy)

1. `python scripts/doctor.py` — once per machine, installs anything missing.
2. Write `<film-folder>/film.json` (schema below). Folder anywhere writable.
3. `python scripts/build.py <film-folder> --stills --jobs 4`

`--stills` saves a few JPEG frames to `stills/`. Interrupted or failed render?
**Rerun the same command** — finished shots are skipped (resume). Fix one shot:
`--shots 2`. Music/SFX changes only: `--audio-only`. Typical film: **≤6 tool calls.**
Speed: a 20 s film ≈ 5–10 min on a modest dual-core machine (less on faster ones);
`size: [960, 540]` nearly halves that.

## film.json

```json
{
  "style": { "mode": "pbr", "grade": "warm", "fps": 24, "size": [1280, 720], "bloom": 0.45 },
  "cast": [
    { "name": "ren", "archetype": "critter", "palette": "fox", "voice": "en-US-GuyNeural" },
    { "name": "kai", "archetype": "human", "palette": "skater", "voice": "en-US-AriaNeural" }
  ],
  "scenes": [
    { "type": "street", "from": 0, "to": 8, "cast": { "ren": [-0.6, 0.5, 20], "kai": [2.2, 1.4, -140] } },
    { "type": "cafe", "from": 8, "to": 16, "cast": { "ren": [0.3, 1.1, 160], "kai": [1.5, -0.7, -20] } }
  ],
  "shots": [
    { "at": [0, 3], "cam": "wide", "who": "ren" },
    { "at": [3, 5.5], "cam": "two", "who": ["ren", "kai"] },
    { "at": [5.5, 8], "cam": "ots", "who": "kai", "handheld": 0.3 }
  ],
  "moves": [ { "who": "kai", "from": [2.2, 1.4], "to": [0.9, 0.6], "at": [4.5, 7], "style": "walk" } ],
  "sits": [ { "who": "ren", "seat": "chair1", "at": [8, 16] } ],
  "sfx": [ { "t": 7.6, "kind": "door" } ],
  "music": { "mood": "warm" },
  "lines": [
    { "who": "ren", "at": 0.8, "text": "Hey Kai! The lamps are already lit.", "emotion": "happy" }
  ]
}
```

Defaults fill everything: missing shots → auto coverage, missing scenes → street,
missing voices → round-robin English voices. Keep a film **under ~60 s**; split longer
stories into parts.

### cast
`archetype`: `critter` (fox/cat/bear/skater/mayor palettes) or `human`.
`palette`: fox, cat, bear, skater, mayor — or override any color, e.g.
`"colors": {"fur": 0xrrggbb, "clothes": 0xrrggbb, "iris": 0xrrggbb}`.
`voice`: any edge-tts name, pattern `<lang>-<region>-<Name>Neural`:
en-US (Guy, Aria, Jenny, Eric, Christopher), en-GB (Ryan, Sonia), en-AU (William,
Natasha), en-IE (Connor), es-ES (Alvaro, Elvira), fr-FR (Henri, Denise),
de-DE (Conrad, Katja), hi-IN (Madhur, Swara), ja-JP (Keita, Nanami),
zh-CN (Yunxi, Xiaoxiao), pt-BR (Antonio, Francisca), ru-RU (Dmitry, Svetlana), it-IT...
`pitch` on cast (e.g. `"+5Hz"`) differentiates similar voices. User audio instead of
TTS: line-level `"audio": "voiceover.mp3"` (path relative to film folder).

### lines → voice + lip-sync + gestures
`emotion`: neutral, happy, sad, angry, surprised, scared. `rate` `"+10%"` to speed talk.
Lip-sync (visemes) and energy come from word timestamps automatically.
Gestures are auto-suggested from keywords ("hi"→wave, "no"→shake, "!"→nod, "look"→point,
"maybe"→think); override with `"gesture": "wave"` or
`"gestures": [{"clip": "point", "at": 0.5, "dur": 1.1, "side": "R", "hold": false}]`.
Clips: `wave point nod shake shrug think`.

### scenes (built-in sets)
`street` (dusk city: lamps, storefronts, bench, car), `cafe` (warm interior: tables,
counter, window), `void` (symbolic dark stage with floating geometry).
Scene `cast` maps name → `[x, z]` or `[x, z, facingDeg]` (y is the floor; characters
are re-placed per scene — write a cut between scenes). Anchor keys for shots/sits:
street `bench corner lamppost door insert_car` · cafe `chair1 chair2 counter behind
table1 table2 window door insert_cup` · void `center mark monolith insert_orb`.
`sits` seats: `chair1`, `chair2` (cafe) or `bench` (street).

### shots (cameras)
`cam`: `wide full medium close ecu two ots insert low high` · `who`: name or `[a, b]`.
Options: `angle` (deg around target), `d` (distance scale), `fov`, `handheld` (0..1),
`move`: `{"type":"dolly","from":1.1,"to":0.85}` (or `pan`/`orbit` with `"amt"`,
`crane` with from/to heights). `insert` targets an anchor: `{"cam":"insert","who":"insert_cup"}`.
Cut rhythm: 2–4 s per shot reads best. Scene changes are hard cuts.

### style
`mode`: `pbr` (3D Pixar-lite) or `toon` (flat 2D cel look, same rig).
`grade`: `warm dusk cool neutral noir dream`. `size`: `[1280,720]` default,
`[960,540]` for speed. `bloom` 0..1. `fps` 24.

### music + sfx
`music.mood`: `warm cozy hopeful happy | tense dark mystery | playful quirky light |
sad melancholy tender | none`. SFX auto: footsteps under every walk (surface picked
from scene), soft whoosh at every cut. Manual kinds: `door dooropen doorclose bell
glass metal punch cloth creak click latch book thud pop chime whoosh` with optional
`"gain"`. Full soundtrack is ducked under dialogue automatically.

## Rules
- ≤8 tool calls per film (doctor once per machine, then write + build + fix).
- One folder per film; never edit files inside `stage/`, `shots/`, `audio/` by hand.
- Verify via `audit.json` + `stills/` (frames are checked for black/flat/loudness
  automatically). If audit says WARN, rerun build once before deeper debugging.
- The engine needs real Chromium — desktop bridge only (not browser-only sessions).

## Troubleshooting
- Voice 403/timeouts → rerun `doctor.py` (upgrades edge-tts), or use line `"audio"`.
- "engine did not load" → check film.json parses (`python -m json.tool film.json`).
- Missing shots at end → rerun same command (resume).
- Slow → smaller `size`, fewer scenes, `--jobs` up to 6.
