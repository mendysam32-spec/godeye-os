# Editing

## Folders

`new_reel.sh` creates the folders of `<video folder>/_reel/`:

- `reference/`: audio and analysis of the reference reel.
- `voice/`: takes, `scribe_words.json`.
- `hook/`: Atlas Cloud images and video.
- `remotion/`: the project.
- `render/`: segments (`.mkv`, `.audio.wav`), kept to re-assemble.
- `exports/`: deliverables.

`script.md` and `README.md` are written by hand in the same place.

## The project

Unchanged from one reel to the next: `src/reel/Reel.tsx`, `kit.tsx`, `anim.ts`, `theme.ts`, `scripts/`.

Changed per reel: `reel.json` (text and settings), `src/reel/scenes/` (scenes), `src/reel/BRIEF.md` (brief).

Generated: `src/reel/data.ts` and `src/reel/CUES.md`, by `python3 scripts/build_reel.py`, to run again whenever `reel.json` or the voice changes.

## reel.json

- `id`: name of the exported files, for example `Reel-This-voice`.
- `language`: language code of the reel (`en`, `fr`...). It drives the typography rules of the captions.
- `hook.video`: true as soon as `public/reel/hook.mp4` exists.
- `sections`: the **exact** text of the voice, split into `hook`, `stakes`, `elements` (list), `recap`, `cta`, `outro`. The number of elements sets the number of boxes and segments.
- `display`: spoken words to written words. `{"five": "5", "eleven labs": "ElevenLabs"}`.
- `stakes`: titles per phase, each title on a `word` of the voice (`n` for the 2nd occurrence), the word on which the boxes appear, the text under the boxes.
- `headers`: one per element. `kicker` in capitals (the verb), `before` + `word` (the title), `window`, `icon`, `size` if the title is wider than 900 px. `icon` is `claude` or a name from `src/components/Icon.tsx`. The Claude logo only appears if the topic is Claude.
- `overview`: header and window of the recap, same shape.
- `recap`: one line per element, triggered by a word; optional `strike` (what the reel buries); `peak`, the final sentence on a big pill.
- `guide`: title, keyword, lines of the card, text of the link button (`LINK IN BIO`), and the words of the voice that trigger each gesture: `subscribe`, `link` (the button appears), `click` (the cursor clicks it), `keyword`. See `script.md`.
- `cover`: see `cover.md`.

`build_reel.py` checks every word quoted in its section, the logo files and `hook.mp4`, and stops with the list of what is missing. Words used in the scenes are checked at render time: "Cue not found".

## The grid

Everything is defined in `kit.tsx`. Instagram safe zones: nothing important above y 200, below y 1560, or right of x 960 below y 1130.

- Progress bar: y 188.
- Header: y 226 to 344.
- Window: x 60, y 372, 960 x 758, content 960 x 700.
- Captions: centered on y 1262.
- Presenter mascot: feet at y 1552.

## Sharing the work between agents

The template compiles from the start: each element has a placeholder scene (`PlaceholderElement.tsx`), which gives an animatic. The agents replace it.

1. Write `src/reel/BRIEF.md`: context, pointer to `references/scene-rules.md`, real facts, and for each scene the list "word -> what happens". It covers each `ElementN`, plus `Hook` and `Stakes` if they are enriched. `Recap` and `CtaGuide` are driven by `reel.json` and only need a line if they are changed. Model: `assets/example-this-voice/scenes/BRIEF.md`. This is the work that decides the quality: do not rush it.
2. Write `scenes/Stakes.tsx` and enrich `scenes/Hook.tsx` yourself: they set the tone.
3. Launch 3 agents in parallel and split the elements between them: one element per agent for 3 elements, 2 for 5, in separate files (`Element1.tsx`, etc.). They export `Element1` and `e1Sfx`, and touch nothing else. If the script says that agents did the work, these roles must be real. On an agent without subagents, write the scenes one after the other with the same rules.
4. Register the scenes in `scenes/index.tsx`.
5. Look at the stills, then launch a checking agent on the whole reel.

## Check stills

```bash
npx remotion bundle src/index.ts --out-dir "$B"
CHROME_MODE=chrome-for-testing node scripts/stills_bundle.mjs "$B" <output> Reel:120 Reel:400 ...
python3 <skill>/scripts/tile.py ...
```

`Recap.tsx` keeps a row of 5 mascots, designed for a peak like "YOUR TEAM". For another punchline, replace this row in the scene with an object that matches it.

Look at each scene at several moments, especially the last frame of each section, then how the overlap between two scenes holds. Look for: overflowing text, overlap with the captions, empty window, stamp too short, a word displayed before it is said.

## Render

```bash
zsh scripts/render_final.sh
```

Run it in the background. About 4.7 frames/s with software rendering, so 10 to 15 min for 90 s. To retouch a few passages: `BUNDLE=<bundle> zsh scripts/patch_frames.sh ../render Reel 950-1150`, then `zsh scripts/render_final.sh --skip-reel`. To change only the cover: `zsh scripts/render_final.sh --skip-reel`.

## Sound

Already set in `Reel.tsx`: voice without cuts, `soft.wav` at 0.15 during the hook then 0.05, sound effects at gain 0.8. The assembly brings everything to -14 LUFS with a limiter. The music and the sound effects are original files generated by `scripts/make_sounds.py`; replace them with your own if you like, keeping the same names.
