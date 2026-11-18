# Scene rules, to give to the agents

9:16 reel (1080 x 1920, 30 fps), in the language of `reel.json`, faceless. One continuous shot: same background, same window, everything transforms in place, every appearance lands on the spoken word. The audience: curious beginners watching on a phone, often with the sound off.

## Read first

- `src/reel/kit.tsx`: Mascot, Stamp, Check, Toggle, Cursor, ClickRing, VoiceWave, ClaudeMark, IconTile, cardStyle, C, DISPLAY, BODY, MONO, CORAL, CONTENT.
- `src/reel/anim.ts`: `cues`, `cueEnd`, `pop`, `rise`, `fall`, `phase`, `flash`, `path`, `typed`, `CLAMP`, `EASE_OUT`, `EASE_IN_OUT`.
- `src/reel/CUES.md`: the frame of every word.
- `src/components/Icon.tsx`: available icons.
- `assets/example-this-voice/scenes/Stakes.tsx` and `Setting2.tsx` in the skill: the expected level.

## Build rules

1. **One scene = one file** in `src/reel/scenes/`. `ElementN.tsx` exports `export const ElementN: React.FC` and `export const eNSfx: Sfx[]`. Only edit your own files. A new need is coded inside the scene, not in `kit.tsx`.
2. **Drawing area**: the content of the window, 960 x 700, `position: absolute`. Header, progress bar, captions and bottom mascot are handled elsewhere.
3. **Local frames**: `useCurrentFrame()` is 0 at the start of the section. `const c = cues('e1')`, then `c('website')`, `c('setting', 2)` for the 2nd occurrence. No hard-coded frame for an appearance: everything starts from a word.
4. **Rhythm**: something always moves, never more than 1.5 s without a change. Each phase makes room for the next one (`phase`, `fall`), at most 5 or 6 visible elements. Springy appearances (`pop`), 0 to 3 frames before the word.
5. **Readable on a phone**: text of 28 px minimum, 34 to 46 px preferred, card titles on one line (`whiteSpace: 'nowrap'`). Strong contrast. Compute widths with a margin: Space Grotesk 700 is about 0.58 em per character, IBM Plex Mono about 0.6 em.
6. **Style**: the background is already there. Cards use `cardStyle`. `C.mint` (accent, success), `C.gold` (light warning), `C.violet`, `CORAL` (Claude only), `C.red` (forbidden), white for text. Titles in `DISPLAY` 700, text in `BODY`, code and file names in `MONO`. No new full-screen background.
7. **Correct language**: the typography of the reel language (for French: non-breaking space before `: ? !` and inside "5 réglages", accents), never an em dash or en dash.
8. **Truth**: everything shown must be true for this reel. Use the real names from the brief, do not invent numbers, results or clients. No secret on screen.
9. **Technical**: no `<Video>`, no 3D transform (`perspective`, `rotateX/Y`, `translate3d`), unique React keys, no `mixBlendMode`. `Img` and `staticFile` for images. Nothing random outside `random('seed')`.
10. **Sound effects**: `eNSfx` lists `{name, at, vol}` in local frames, 2 to 4 frames before the appearance, volumes 0.1 to 0.3. Names: pop, pop-high, tick, key, click, stamp, ding, chime, whoosh-short, sparkles. About one sound per important appearance; `key` very low (0.08), not on every letter. Nothing at the start of a section.
11. **Check**: `npx tsc --noEmit -p . 2>&1 | grep src/reel` must stay empty for your files. No render: small machines run out of memory, check stills are made elsewhere. Finish by listing in one line what you delivered and any doubt.
12. **Quality**: the result must look like the work of a demanding motion designer. Clear hierarchy, margins of at least 30 px, clean alignments, small living details (glow, light bounce, blinking cursor, filling bar). No rough mockup, no tiny text, no gratuitous decoration.

## Show rather than illustrate

A good scene tells what the voice says with an object that changes state: a button that turns to "Installed", a cable that draws itself, a sheet that travels, a bar that fills up. The title of the sentence is already in the captions: do not repeat it in big letters. When the voice gives a proof, show the real traces: file names, commands, real connectors.

End each element with a tilted stamp (`Stamp`) on its punchline, placed from the start of the sentence so it stays readable.
