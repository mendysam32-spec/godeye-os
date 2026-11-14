---
name: stickman
description: Make cinematic stickman story videos as MP4 from code, plus ElevenLabs voiceover scripts, YouTube titles and thumbnail prompts. Use for /stickman or any stickman animation request.
version: 1.1.0
argument-hint: "[topic or story] [length]"
---

# /stickman

Turn a topic into a finished stickman film rendered entirely from code: flat 2D characters, a dusk palette, film-style camera work and real sound. Four outputs: the video, the voiceover script, YouTube titles and thumbnail prompts.

It works anywhere code can run, including free plans. No paid tools, no AI image or video tools. ElevenLabs is optional and only for voiceover.

Everything below is relative to this skill's folder (the folder holding this file). Find its absolute path once and use it for every script. On Claude Code it is `${CLAUDE_SKILL_DIR}`. Call it `SKILL` in the commands below. Use `python3`, or `python` on Windows.

## Budget — read this first

Every tool call is a full round trip, and on rate-limited free models it is the scarce resource. Keep the count low and the writes long:

- **Target ≤ 6 tool calls** for a standard 2D film with sound: one combined setup command, one `film.js` write, one stills sheet, one `audio_mix.py` edit, one `build.py`, one contact-sheet read.
- **Write `film.js` in ONE file write**, complete and runnable. Never draft it across several chat messages — split scripts hit output caps, and each extra message is another round.
- **Read at most ONE reference file per request**, only when a trigger below fires. The quick map in this file covers standard films.
- **One stills round** by default; a second only if the first sheet shows real problems.
- If a request fails with a rate-limit error, wait ~30 s and retry it once before changing anything.

## Step 1: Work out what was asked

The user may want the whole package or one part. Do only what was asked:

| Request | Do |
|---|---|
| Story ideas | "Story ideas" below, then stop |
| Make a video | Steps 2-6 |
| Write a voiceover script | Read `references/script-playbook.md` once, deliver, stop |
| Titles or thumbnails | Read `references/packaging-playbook.md` once, deliver, stop |
| Full package | Script, then video, then titles and thumbnail prompts |

## Story ideas
If the length is not stated, ask how long the videos should be first. Then give 5 ideas, numbered. Each has a short name, one plain sentence of what happens, and the ending. Fit each idea to that length: under 20 s means one character and one simple turn. Ideas must be easy to animate with what is here, and each must be original. Later, "make idea 3" means that idea.

## Step 2: Ask before building

Unless the request already makes it clear, ask these together in one message (use the question tool if there is one). Skip anything already answered. If nobody is there to answer, use the default and say so.

1. **Style:** 2D or 3D? Default 2D. 3D adds real camera moves around the scene.
2. **Length:** how long? Default 30 s. With an MP3, the voiceover sets the length.
3. **Voiceover:** yes or no? Skip if an MP3 is attached. If yes, they supply an MP3 and its script text, or you write a script for ElevenLabs and they come back with the MP3.
4. **Sound effects:** yes or no? Default yes.
5. **Background music:** yes or no? Default no. If yes, use their uploaded track, otherwise the code-made music bed.
6. **Storyboard:** only if they ask for one.

Do not assume music, effects or voice. Quiet room ambience is not music.

## Step 3: Set up (one command)

```
python3 SKILL/scripts/doctor.py && python3 SKILL/scripts/new_film.py film
```

(add `--3d` for 3D; swap `&&` for `;` in Windows cmd). `doctor.py` installs anything missing. If Chromium cannot run at all, go to "If rendering is not possible".

## The engine — quick map

`film/film.js` sets a global `FILM`, then lists sound events:

```js
FILM={dur:30,cuts:[0,90,150,900],fadeIn:.5,fadeOut:.6,
 cam(shot,u,t){return {x,y,z,b:[...]}},   // u is 0..1 through the shot
 draw(t,cam,shot,u){...},                 // paint layers, then composite
 warm(t){return 0},                        // optional golden grade 0..1
 plants(){return {name:walk.plants()}}};  // footfall times for the mix
say(3.2,'door');                           // sound event on the picture's clock
```

`cuts` are frames at 30 fps; the first is 0 and the last equals `dur*30`. All pose values are pure functions of `t`. No `Math.random`, no `Date.now` — the film must be deterministic.

- **Core** (`engine/core.js`): `layer(name,cam,parallax)`, `comp([[name,blur,alpha],...])`, `reflect(name,floorY,cam)`, `kf`, `lerp`, `ease`, `easeIO`, `seg`, `clamp`, `rng(seed)`, `report(id,p)` and `contact(name,a,b)` (audit feed).
- **Characters** (`engine/chars.js`): `HERO, FRIEND, WOMAN, STRANGER, GUEST_A, GUEST_B`. `actor(x,id,CHAR,pose,cam,rimColour,rimSide)` draws with rim light and reports to the audit. `h2w(p,'r')` gives a hand's world position, `w2l(p,[x,y])` converts back. Seated figures use `noLegs:true`; standing on floor line `y` uses `y:standY(y,s)`.
- **Motion** (`engine/motion.js`): `makeWalk({pts:[[x0,y0],[x1,y1]],t0,t1,steps,scale})` → `w.at(t)` → `walkPose(p,q)` gives planted feet and swinging arms (`{arms:false}` when holding something). Also `blinkAt(t,[times])`, `talk(t,a,b)`.
- **Props** (`engine/props.js`): `drawUmbrella`, `drawCup`, `cupGrip`, `gripHand`, `openHand`, `sideTable`, `sideChair`, `drawGun`, `drawClock`, `drawRain`, `softShadow`.
- **Sets** (`engine/sets/`): `street.js` (sky at parallax .35, buildings .65, floor `GY`=930, `s`≈.66), `cafe.js` (one room, x -900..3700, `cafeScale(y)`, `DOOR`, `cafeOutside`, `pendant`, `doorLeaf`), `room.js` (`drawRoom`, `drawRoomTable` for across-a-table scenes), `symbolic.js` (`drawVoid`, `slab`, silhouettes).

New sets follow the same rule: flat shapes, the palette, one world.

## Rules that never bend

- Flat 2D, dusk palette (purple→coral→amber sky, teal accents, warm windows, rim light, vignette, fine grain). Keep characters identical between shots.
- **No decorative circles**: no bokeh, no string bulbs, no dust specks, no sparkle fields, no glowing balls. Reflections are long soft smears, never discs.
- Simple hands only — never white mitten hands. An idle arm just ends with no hand. A holding hand is a slim capsule or small fist with thin finger strokes.
- Everything moves a little: breathing, blinks, drift or a slow camera. Walks use planted feet; feet never slide.
- Prop contact has three beats: grip, carry, release. Drive hands from the prop's position and report it with `contact()`; draw the grip hand after the prop.
- Doors open first, then the character walks in. A door never passes through anyone.
- Characters keep the same positions and distances between shots. One world, fixed positions; each shot is only a camera on it. Keep screen direction fixed; include one wide shot.
- Sound matches the mood — no bright bells in tense scenes.
- Film, not slideshow: varied shot lengths, camera moves, focus. What the video is about must be obvious straight away.

## Step 4: Plan the film (before any drawing code)

1. One sentence a distracted viewer would understand.
2. A beat sheet: each beat has an action, a feeling, a camera and a sound.
3. **One world:** a list of fixed positions for every character and prop.
4. A shot list with cut FRAMES (30 fps). Aim for 8-11 shots per 30 s; include a wide shot that shows the geography.
5. The thumbnail moment, if a package was asked for, so it exists as a real scene.

## Step 5: Build

1. Write `film/film.js` in ONE write (the engine files are already in the film folder; start from the starter film that `new_film.py` copied). One `medusa_editFile` call, complete and runnable.
2. One stills sheet at the busiest moments: `python3 SKILL/scripts/stills.py film sheet.jpg 1 4.5 9`. Fix what it shows.
3. Edit the marked block of `film/audio_mix.py` to match the sound brief.
4. Render, mix, join and audit in one command:

```
python3 SKILL/scripts/build.py film --out my-film.mp4
```

Run it in the background if the environment limits command time, and poll it. Re-running resumes, because each shot is its own file. After a fix, `--shots 3 7` redoes only those shots; `--audio-only` remixes the sound.

## Step 6: Check, then deliver

`build.py` ends with the audit. Fix every ISSUE, or state why a flagged moment is intended. Then view `film/contact_sheet.jpg` (from the encoded file) and check by eye: faces read the intended emotion and brows are not accidentally angry; hands touch what they hold; arms bend the right way on walks; doors open before anyone walks in; positions stay continuous between shots; no decorative circles.

Deliver the MP4 with a short note. Say plainly that you cannot hear the mix: you measured it, so the user should listen to it. Do not claim checks you did not run.

## If rendering is not possible

No code execution or browser? Run `python3 SKILL/scripts/bundle_player.py film` when you can (one HTML file that plays the film and records a real-time WebM). If you cannot run anything, say what is missing and offer the script, titles and thumbnail prompts, which need no rendering. Never rename a WebM to MP4.

## References — read only on trigger

| File | Read when |
|---|---|
| `references/production.md` | First film of a session (traps that save time) |
| `references/engine.md` | Custom props/sets beyond the quick map |
| `references/film-craft.md` | Films over ~45 s, or when the story feels flat |
| `references/symbolic-beats.md` | Symbolic/metaphor films |
| `references/sound.md` | Custom mixes beyond the audio_mix defaults |
| `references/script-playbook.md` | Writing a voiceover script |
| `references/voiceover.md` | Working with a supplied MP3 |
| `references/packaging-playbook.md` | Titles and thumbnail prompts |
| `references/3d.md` | 3D films |

## Rules on originality

Reference videos, titles, thumbnails or transcripts that a user shares are for general patterns only: length, wording, structure, pacing. Never copy or save anything specific to someone else's work, and never reuse a premise, character, plot, line or look. Every film gets its own story.
