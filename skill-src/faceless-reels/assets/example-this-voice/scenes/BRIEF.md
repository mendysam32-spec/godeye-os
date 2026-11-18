# Scene brief for the reel

Instagram reel 9:16 (1080 × 1920, 30 fps), faceless. The reel was originally produced in French; this brief follows the English adaptation in `../script.md`. Hook: "This voice is not me." Claude did everything: script, voice, animations, editing. The edit is **one continuous shot**: same background, same window, everything transforms in place, every appearance lands on the spoken word. The audience: curious beginners watching on their phone, often with the sound off.

## Read first

- `src/reel/kit.tsx`: all the building blocks (Mascot, Stamp, Check, Toggle, Cursor, ClickRing, VoiceWave, ClaudeMark, IconTile, cardStyle, C, DISPLAY, BODY, MONO, CORAL, CONTENT).
- `src/reel/anim.ts`: `cues`, `cueEnd`, `pop`, `rise`, `fall`, `phase`, `flash`, `path`, `typed`, `CLAMP`, `EASE_OUT`, `EASE_IN_OUT`.
- `src/reel/scenes/Stakes.tsx`: **the model scene**; copy its way of writing (`T` constants timed on words, one constant per appearance).
- `src/reel/CUES.md`: the frames of every word, by section.
- `src/components/Icon.tsx`: available icons (star message send mail calendar plane file clock coins briefcase laptop sparkles eye server users plug link lock shield moon check x image video database refresh rocket workflow building code bot search pointer zap bell tag play globe key download terminal heart gauge).

## Build rules

1. **One scene = one file** in `src/reel/scenes/`. It exports `export const SettingN: React.FC` (or `Recap`, `Cta`) and `export const rNSfx: Sfx[]` (or `recapSfx`, `ctaSfx`). Do not change these names. Edit **only** your own files. No changes to `kit.tsx`, `anim.ts`, `Reel.tsx`, `data.ts`: a new need is coded locally in the scene.
2. **Drawing area**: the scene is drawn inside the window content, **960 × 700** (x 0 to 960, y 0 to 700), `position: absolute`, `overflow` already clipped. The header, progress bar, captions and bottom mascot are handled elsewhere: do not redraw them.
3. **Local frames**: `useCurrentFrame()` is 0 at the start of the section. `const c = cues('r1')`, then `c('website')`, `c('computer', 2)` for the 2nd occurrence. Never hard-code a frame for an appearance: everything starts from a word. A word missing from the section throws an error.
4. **Pace**: something always moves. Never more than 1.5 s without a change on screen. Each phase makes room for the next (`phase`, `fall`), at most 5 or 6 elements visible at once. Spring entrances (`pop`), slightly before the word (0 to 3 frames).
5. **Readable on a phone**: text 28 px minimum, 34 to 46 px preferred, card titles on one line (`whiteSpace: 'nowrap'`). Strong contrast. No overflowing text: compute widths with a margin (Space Grotesk 700 ≈ 0.58 em per character, IBM Plex Mono ≈ 0.6 em).
6. **Style**: background already set. Cards use `cardStyle`. Colors `C.mint` (accent, success), `C.gold` (light warning), `C.violet`, `CORAL` (Claude only), `C.red` (forbidden), white for text. Titles in `DISPLAY` 700, body text in `BODY`, code and file names in `MONO`. No new full-screen background.
7. **Correct typography** in the reel's language (for a French reel: non-breaking space before `: ? !` and inside "5 réglages", accents). **Never an em dash or en dash** in displayed text.
8. **Truth**: everything shown must be true for this reel. Use the real names below, do not invent numbers, results or clients.
9. **Technical**: no `<Video>`, no 3D transforms (`perspective`, `rotateX/Y`, `translate3d`), unique React keys, no `mixBlendMode`. `Img` and `staticFile` from `remotion` for images. Nothing random except Remotion's `random('seed')`.
10. **Sound effects**: `rNSfx` lists `{name, at, vol}` in local frames, 2 to 4 frames before the appearance. Names: `pop`, `pop-high`, `tick`, `key`, `click`, `stamp`, `ding`, `chime`, `whoosh-short`, `sparkles`. Volumes 0.1 to 0.3. About one sound per important appearance; `key` very low (0.08) for typed text, not on every letter. No sound on the section start (already handled).
11. **Check**: `npx tsc --noEmit -p . 2>&1 | grep src/reel` must stay empty for your files. **Do not run any render or `remotion`**: the machine has 8 GB of memory, the check frames are made elsewhere. Finish by listing in one line what you delivered and any doubt.
12. **Quality**: the result must look like the work of a demanding motion designer. Clear hierarchy, regular margins (at least 30 px on the edges), clean alignment, small living details (glow, slight bounce, blinking cursor, filling bar), polished internal transitions. No rough mockup, no tiny text, no gratuitous decoration.

## Real facts to use

- Project folder: `video - 000`, subfolders `hook/`, `voice/`, `remotion/`.
- Files: `script.md`, `voice.wav`, `hook.mp4`, `Reel.tsx`, `data.ts`, `Reel-Claude.mp4`.
- Real commands: `ffmpeg -i take_1.mp3 voice.wav`, `python3 scripts/build_reel.py`, `npx remotion render Reel-Claude`.
- The creator's real connectors: Gmail (write "Email"), Google Calendar ("Calendar"), Notion, ElevenLabs, Atlas Cloud.
- Voice: the creator's cloned voice on ElevenLabs, labeled "MY VOICE" on screen.
- Real skill: folder `video-editing`, file `SKILL.md`, title "Video editing". Real steps: "Transcribe the voice", "Animate word by word", "Mix at -14 LUFS". Real colors: `#0A1118` (night blue), `#5FE3C1` (mint), `#F5C451` (gold), `#7B4FE0` (violet), `#D44FB3` (magenta). Real captions: capitals, current word on a mint pill. Real sound: voice at -14 LUFS, music very low.
- Real instructions (file `CLAUDE.md`): "Plan everything upfront.", "Write plainly and directly.", "Never use em dashes.", "Reply in English.".
- Available images: `reel/empty_studio.jpg` (the empty room), `reel/clone.jpg` (the particle clone seated in the studio), both 1080 × 1920.

## The scenes, beat by beat

Each line gives the trigger word and what happens. Keep this intent; layout details are yours to polish.

### Setting1.tsx (section `r1`, 363 frames): the app on your computer

The window title switches by itself from "claude.ai" to "Claude · on my Mac" on the second "computer".
- `First` to `website` (0 to 80): a centered card "Claude for Mac": large rounded-square app icon (dark coral or white background, `ClaudeMark`), "Install" button. The cursor arrives, clicks on `computer` (1st occurrence), the button turns into a full bar then a check.
- `On` / `website`: the card makes room for a chat conversation. User bubble on the right: "Edit my video". Label top left: "ON THE WEBSITE".
- `answers`: Claude replies with typed text: "Here are a few tips to edit your video...". Nothing else happens: it is deliberately tame.
- `computer` (2nd occurrence): everything slides: the window becomes the app. Left column (≈ 340 px): file tree. Right area: dark terminal. Label "ON YOUR COMPUTER" in mint.
- `acts`: animated pill "Claude is working..." (pulsing mint dot) and a mint flash.
- `opens` / `folders`: the `video - 000` folder opens (rotating chevron), `hook/`, `voice/`, `remotion/` appear one by one.
- `creates` / `files`: three files appear with a mint "+": `script.md`, `voice.wav`, `Reel.tsx`.
- `runs` / `programs`: in the terminal, the three real commands are typed very fast, each followed by a check.
- `video`: the terminal makes room for a render card: 9:16 thumbnail (`reel/clone.jpg`, rounded corners) and a "Reel-Claude.mp4" bar that fills from `video` to `Mac`, with a percentage.
- `Mac`: 100 %, check, stamp "MADE ON MY MAC", clearly readable, tilted.

### Setting2.tsx (section `r2`, 373 frames): connectors

Star diagram: Claude in the center, cables that draw themselves (SVG `stroke-dashoffset`, with a glowing dot traveling along).
- `connectors`: central Claude tile (rounded square, `ClaudeMark`, coral glow) at the top of the diagram.
- `few` / `clicks`: the cursor clicks twice on a "+ Connect" button; `ClickRing`.
- `connects`: the Claude tile bounces, a plug (`plug`) lights up on it.
- `email`: "Email" tile (icon `mail`), cable drawing itself, toggle switching ON.
- `calendar`: same with `calendar`, "Calendar".
- `Notion`: same with `file`, "Notion".
- `I`: the three tiles fade and move up; a large "ElevenLabs" card arrives from the bottom.
- `Labs`: its cable draws itself, toggle ON, mint glow.
- `wrote` / `text`: a small `script.md` sheet fills with lines next to Claude.
- `sent`: the sheet travels along the cable to ElevenLabs.
- `back` ("got back"): a card with a `VoiceWave` sound wave travels back along the cable (pass `abs={frame + SECTIONS.r2.from}`), label "MY VOICE".
- `voice`: the wave card grows in the center, the wave really follows the voice.
- `All` / `itself`: stamp "ALL BY ITSELF".

### Setting3.tsx (section `r3`, 337 frames): skills

- `skills`: a light sheet (off-white background, night-blue text, the only large light area in the reel) arrives in the center: header `SKILL.md`, title "Video editing".
- `method`: the three real steps are written one after the other, numbered.
- `written` to `all`: a mint highlight sweeps the lines; on `all`, a small "Saved" check.
- `learns`: the sheet shrinks and flies to a Claude tile (or a mini `Mascot`); "Skill loaded" pill with a check.
- `applies` to `time`: three identical 9:16 mini videos (cards with the same layout) arrive side by side, each checked, on `applies`, `every`, `time`. Labels "Video 1", "Video 2", "Video 3". The idea: the same result every time.
- `I`: the thumbnails leave. Internal title "My editing style".
- `colors`: five round chips in the real colors, with their code in `MONO`.
- `captions`: a sample caption in capitals with the mint pill jumping from word to word: "EVERY WORD ON BEAT".
- `sound`: a small wave and the label "-14 LUFS". The three blocks stay visible, neatly stacked.

### Setting4.tsx (section `r4`, 274 frames): instructions

- `instructions`: text editor: `CLAUDE.md` tab, line numbers, blinking cursor, first line `# How I work`.
- `tell` to `work`: a line is typed: "Plan everything upfront."; on `once`, a small stamp "ONLY ONCE".
- `language`: typed line: "Reply in English." with icon `globe`.
- `style`: "Write plainly and directly." with icon `message`.
- `never` / `see`: red line "Never use em dashes." with icon `x`, short shake, the word "Never" in bright red.
- `remembers`: the editor shrinks into a pinned note on the left, with a mint glow and the label "Remembered".
- `every` / `conversation`: on the right, three cards "Conversation 1 / 2 / 3" fan in; the note sends a copy (small pill) to each, each checked.

### Setting5.tsx (section `r5`, 320 frames): parallel agents

The "5" header is there from the start, the title "Parallel agents" arrives by itself on `agents`.
- `fifth`: huge mint "5" in the center of the window, bouncing, with a glow.
- `gets` / `crazy`: tilted stamp "IT GETS CRAZY", light shake of the "5".
- `agents`: the 5 leaves; a `Mascot` (h ≈ 300) arrives in the center.
- `multiplies`: it splits: two copies spring out of it, then all three line up to the left of the three work rows.
- Each row: mini mascot (h ≈ 150, different `seed`, `look` to the right), title, real file name in `MONO`, progress bar with percentage, small pulsing dot.
  - Row 1: "Agent 1", "writes a scene", `Setting1.tsx`: starts on `writes`.
  - Row 2: "Agent 2", "builds the next one", `Setting3.tsx`: starts on `builds`.
  - Row 3: "Agent 3", "checks everything", `checks`: starts on `checks`.
  - The bars run at the same time, at different speeds, and all reach 100 % on `time`.
- `At`: stamp "AT THE SAME TIME", placed at the start of the sentence so it stays readable.
- `time`: three checks, mascots `mood="happy"`.

### Recap.tsx (section `recap`, 192 frames): the recap

- Five stacked rows (height ≈ 104, gap 12). Each: numbered chip, big verb ("It acts", "It connects", "It learns", "It remembers", "It multiplies"), a discreet `MONO` tag on the right ("The app", "Connectors", "Skills", "Instructions", "Agents"), check.
- Each row arrives on its word: `acts`, `connects`, `learns`, `remembers`, `multiplies`, with a fast bounce from the left.
- `chatbot`: the rows fade and move up; a "Chatbot" chat bubble appears in the center and gets crossed out by a red line that draws itself.
- `your` / `team`: five mascots in a row (`mood="happy"`, different `seed`, heights ≈ 210) jump in turn, with a big mint pill "YOUR TEAM" above. This is the emotional peak of the reel: take care of it.

### Cta.tsx (section `cta`, 161 frames + 24 frames of hold): call to action

Make it last up to 185 frames. Show gestures, not only words.
- `Save`: on the left, a 9:16 thumbnail of the reel (`reel/clone.jpg`, height ≈ 560, rounded corners). On the right, a column of social icons: heart, bubble, plane, bookmark (`tag` or a bookmark drawn in SVG).
- `video`: the cursor goes to the bookmark and clicks: it fills with mint, `ClickRing`, small "Saved" message.
- `Subscribe`: a big "Subscribe" button appears in the center, with an avatar (mini `Mascot`) and the creator's name. The cursor clicks 8 frames after the word: the button becomes "Subscribed" with a check, mint outline.
- `guide`: five chips numbered 1 to 5 appear.
- `click` / `bio` / `keyword`: they check off in a cascade, one by one, until the end. (The first version of this ending listed the five settings step by step; it was later redone with the keyword rule: subscribe, link in bio, keyword. See `../README.md`.)
