---
name: faceless-reels
version: 1.0.0
description: "Creates an original faceless vertical reel or Short (9:16, 1 to 2 minutes) from start to finish: analysis of a reference reel, script (hook, explanation, call to action with a guide and a keyword), cloned ElevenLabs voice that is never cut, optional Atlas Cloud opening shot, one-shot Remotion animation with a mascot and word-by-word captions, a click-worthy cover set as the first frame, and an ending that always makes the same three moves: subscribe, link in bio, keyword. Use this skill whenever the user wants to create, remake or take inspiration from a faceless reel, Short or TikTok (\"make a reel like this one\", \"here is an Instagram link, make me the same\", \"a reel about the 5 tools...\", \"turn this topic into a reel\"), even without saying \"faceless\", and also to rework or fix a reel already made with this skill, its cover or its keyword."
---

# Faceless reels

This skill reproduces a production chain that was validated on a real reel ("This voice is not me", shipped November 2026). The goal: a 1080 x 1920, 30 fps reel of 60 to 120 s that holds attention to the end, because everything transforms in place, in rhythm with the voice.

## Settings

Personal settings live in `config.json` at the root of this skill. If it does not exist, copy `config.example.json` to `config.json` and ask the user to fill in what is missing (at least `elevenlabs_voice_id`). Read it at the start of every run. `<skill>` below means the folder of this skill.

| Key | Use |
|---|---|
| `creator_name` | How to refer to the user in reports |
| `language` | Default language of the reel (voice, captions, on-screen text). A request in another language wins |
| `elevenlabs_voice_id`, `elevenlabs_model` | The cloned voice |
| `whisper_model` | Local whisper.cpp model used for checks |
| `projects_root` | Where previous reel projects live (to reuse `node_modules`) |
| `cta` | The exact wording of the three closing moves, in the reel language |
| `guides_page` | The page linked in the user's bio, where the guides live |
| `timezone`, `publish_hour`, `caps`, `telegram_env` | Autonomous mode only |

## MEDUSA runtime

This skill runs on the user's machine through the MEDUSA desktop bridge. The scripts are Python (Windows, macOS, Linux); the original zsh scripts are kept next to them as upstream reference, so wherever a guide shows `zsh foo.sh` or `python3 foo.py`, run `python foo.py` instead.

- Check the machine once: `python <skill>/scripts/doctor.py` (exits 1 with the exact missing item). Requires Python 3.9+ with numpy and pillow, node/npm, ffmpeg and ffprobe on PATH.
- On the desktop app the skill is mirrored to `Documents/MEDUSA/skills/faceless-reels`; `<skill>` is that folder (the `diskPath` returned when the skill is installed).
- Every command goes through `medusa_runCommand` with `cwd` set to the project folder and `timeoutMs` between 600000 and 900000. A full 90 s software render takes 10 to 15 minutes, longer than one tool call allows: render the segments in separate calls (`python scripts/render_parts.py "<render folder>" Reel` resumes where it stopped), then finish with `python scripts/render_final.py --skip-reel`.
- `ELEVENLABS_API_KEY` and the Telegram token live in the environment or the env file only: never write them in a project file and never show them on screen.
- Announce the cost of every paid generation (ElevenLabs takes, Atlas Cloud shots) before spending; wait for agreement unless the user already authorized it.

## User rules

- Write plainly and directly. Never use em dashes or filler phrases, on screen or in messages.
- Typography of the reel language on screen. For French: non-breaking spaces before `: ? !` and inside "5 réglages", guillemets « ».
- **The voice is never cut.** Only the animation is edited. No duration changes, no silence removed.
- **No face in the video**, except on the cover, which uses the user's photo.
- **The cover is always the first frame of the video**, and it is also delivered as a separate file.
- **The ending always makes the three moves**: subscribe to get the guide, click the link in bio, type the keyword. In the voice, in the captions and on screen (SUBSCRIBED button, LINK IN BIO button, a field where the keyword gets typed). The keyword is directly related to the guide and the topic, and MEDUSA proposes it. Say "link in bio", never "link in the description": the guides page is in the user's bio.
- Everything said must be true: no invented numbers, no unsourced superlatives, no faked screenshots. A lived proof beats a promise.
- No token, password or key readable on screen.
- Caption of each reel: 5 hashtags at most, no links, on every network. It always ends by showing how to get the guide, for example: "The five prompts are in the guide, ready to copy and paste. To get it: subscribe, go to the link in bio and type the keyword FIVE."
- Faceless reel with a cloned voice: declare AI-generated content when publishing (for example with Blotato: `isAiGenerated: true` on TikTok, `containsSyntheticMedia: true` on YouTube).
- Music at 0.05 under the voice, never more.
- Announce the cost of paid generations. If the user already authorized Atlas Cloud or ElevenLabs in the request, announce and go on. Otherwise wait for their agreement.
- Go all the way without stopping, check your own work, say clearly what was verified and what was not. Never publish unless the user asks, except in autonomous mode.
- Small machines (8 GB of RAM): one Remotion bundle at a time, renders in the background, intermediate files cleaned at the end.

## Steps

Plan everything at the start. Each step has its guide: read it when you reach the step.

1. **Locate.** Video folder, reference reel (file or link), topic, the user's cover image (`cover.png` in the video folder, else `<skill>/assets/cover/cover-template.png` and say so), free disk space. Read the useful `references/` and the project memory.
2. **Analyze the reference**, if there is one: extract the audio, transcribe it with Scribe, look at the video frame by frame, write `_reel/reference/reel_analysis.md`. See `references/script.md`.
3. **Write the script** and the promised guide: `_reel/script.md`, with the truth of each claim. See `references/script.md`.
4. **Create the project**: `python <skill>/scripts/new_reel.py "<video folder>"`, then fill in `remotion/reel.json`. See `references/editing.md`.
5. **Free animatic**: `python <skill>/scripts/fake_words.py`, then `python scripts/build_reel.py`, which checks `reel.json`, then a few stills. Does the script fit on screen?
6. **Voice**: 2 ElevenLabs takes, Scribe word timestamps on the chosen take, processing without cuts. See `references/voice.md`.
7. **Atlas Cloud opening shot** (optional, recommended): start image, end image, Kling, retiming on the voice. See `references/opening-shot.md`.
8. **Scenes**: `src/reel/BRIEF.md` beat by beat, then one agent per group of scenes in parallel and one checking agent. See `references/editing.md` and `references/scene-rules.md`.
9. **Cover**: click-worthy title and logos. See `references/cover.md`.
10. **Check with stills**, fix, then **render**: `python scripts/render_final.py` in the background (10 to 15 min for 90 s). On MEDUSA render segment-wise (see MEDUSA runtime).
11. **Verify** the final file and write `exports/instagram.md`. See `references/checks.md`.
12. **Finish**: project README, project memory, intermediate files deleted, files sent, summary with what is left to listen to or decide.

## Autonomous mode

If the request comes from a scheduled task, or if the user asks to process the `inspiration/` folder, follow `references/autonomous-mode.md`: no questions, cost caps, guide, scheduled posts, notification.

## What makes the reel work

- **Hook in under 3 s**, with a proof or a promise, readable from the very first frame after the cover.
- **A visible open loop**: N numbered empty boxes, which become the progress bar.
- **N elements** of the same shape, growing in difficulty and value, the best one last, announced by a re-hook.
- **One single shot**: same background, same window. Never a hard cut.
- **Every appearance lands on the spoken word**, never more than 1.5 s without a change on screen.
- **Lightning recap**, then a punchline that changes how the viewer sees the topic.
- **An ending made of gestures**, shown and not only said: the cursor subscribes, clicks the link in bio, then the keyword gets typed.
- **Loop**: the last sentence leads back to the first one, and the last frame becomes the first one again.

## Guides

| Read | When |
|---|---|
| `references/script.md` | Analyze a reference, write the script, choose the keyword and the guide |
| `references/voice.md` | Generate the voice, get the words, process the sound without cuts |
| `references/opening-shot.md` | Prompts and retiming of the opening shot, costs |
| `references/editing.md` | Project layout, `reel.json`, agents, check stills, render |
| `references/scene-rules.md` | Rules to give to the agents who write the scenes |
| `references/cover.md` | Title, logos, formats, placing it as the first frame |
| `references/checks.md` | Checks of the final file, caption, what is left to a human |
| `references/autonomous-mode.md` | Process a file from the `inspiration/` folder alone, from the reference to the scheduled posts |

`assets/reel-template/` is the Remotion project. `assets/example-this-voice/` holds the whole validated reel: script, analysis, real scenes, brief. It is the quality reference: read its `README.md`, then at least `Stakes.tsx` and `Setting2.tsx` before writing scenes. `assets/example-6-tools/` gives reusable scenes for a ranking or a tiered list.

## Lessons already paid for

- With two takes, Scribe transcribed the **second** one: read `source.url` in the result and keep the take it actually transcribed.
- Scribe's `words.json` contains the tags (`[softly]`) and ":" as words: remove them, and keep the `{"words": [...]}` shape in `scribe_words.json`.
- A sentence before "Subscribe" left the window empty: `CtaGuide.tsx` now shows "Save" during that time.
- The chime and the sparkles covered the keyword and the punchline (voice at -1.9 dB on the keyword): volumes are lowered in the template. Still look at the tightest passages.
- Whisper drifts and makes mistakes: timings come from Scribe, text comes from the script (`build_reel.py` aligns the two).
- A Whisper prompt containing "Claude" made it read "clone" as "Claude". Check without a prompt, and with timestamps: `-nt` skips sentences.
- A sound effect on a key word of the hook masks the voice: place it after the end of the word (gap of at least 7 dB, measured).
- A scene that stops exactly at the end of its section cuts the final stamp: scenes overlap (`STAGES` in `Reel.tsx`), and a stamp is placed from the start of the sentence.
- An empty window while a sentence announces a list looks broken: place dotted slots from the start of the sentence.
- Numbers written as words break caption pages: `build_reel.py` keeps "5 settings" together.
- GPU rendering makes elements disappear one frame out of three: always `GL=swangle CONCURRENCY=1` (already in `render_final.sh`).
- No 3D transform on a video, no `mixBlendMode`, unique React keys.
- chrome-headless-shell hangs: `CHROME_MODE=chrome-for-testing` (already in the scripts).
- Redoing a sentence after the render: keep the validated voice, generate the ending in one piece and splice it in a pause (`references/voice.md`).
- On the cover, a brand logo reduced to a symbol can be misread: the two bars of ElevenLabs looked like a pause button, so the name stays written under it.
