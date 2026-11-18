# Faceless Reels Skill

An AI agent skill that creates faceless vertical reels and Shorts (9:16, 1 to 2 minutes) from start to finish: script, cloned ElevenLabs voice, Atlas Cloud opening shot, Remotion animation with word-by-word captions, and a click-worthy cover. Works with Claude Code, Hermes and OpenClaw.

You give your agent a topic or a reference reel. It gives you back a finished `.mp4`, its cover, and a caption ready to post.

## What the skill does

1. **Analyzes a reference reel** (optional): structure, pace, retention tricks. It keeps the architecture, never the text or the visuals of another creator.
2. **Writes an original script**: a hook in under 3 seconds, an open loop, N elements of growing value, a lightning recap, and a fixed ending.
3. **Generates the voice** with your cloned ElevenLabs voice (2 takes, the best one is kept), then gets word-level timestamps with ElevenLabs Scribe. The voice is never cut.
4. **Creates an optional opening shot** with Atlas Cloud (image + Kling video), retimed on the voice.
5. **Animates everything in Remotion** as one continuous shot: a mascot whose mouth follows the voice, word-by-word captions, a progress bar, scenes where every element appears on the spoken word. Scenes can be written by parallel agents.
6. **Builds the cover** with a click-worthy title, places it as the first frame and exports it separately.
7. **Checks the final file**: format, loudness (-14 LUFS), voice integrity, voice-over-music gap, first frame, loop, flicker, full transcript against the script.
8. **Ends every reel with the same three moves**: subscribe, link in bio, type the keyword. The keyword opens a free guide on your guides page.

An optional **autonomous mode** processes one reference video per night from an `inspiration/` folder, publishes the guide, schedules the posts and sends you a Telegram message.

## Requirements

- **macOS** (tested on an M1 with 8 GB of RAM). The scripts use `zsh`. Linux should work with `zsh` installed but is not tested. Windows is not supported.
- **Node.js** 20.19+ and npm
- **Python 3** with `numpy` and `pillow`
- **ffmpeg**
- **whisper.cpp** with a model, for local checks
- **An ElevenLabs account** with a cloned voice (a plan that allows voice cloning)
- **Atlas Cloud** (optional), for the opening shot. About $1.50 per reel
- **Blotato** (optional), to publish or schedule posts

On macOS:

```bash
brew install node ffmpeg whisper-cpp
```

```bash
pip3 install numpy pillow
```

```bash
mkdir -p ~/.cache/whisper-cpp && curl -L -o ~/.cache/whisper-cpp/ggml-large-v3-turbo-q8_0.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin
```

## Installation

The repository root is the skill folder (it contains `SKILL.md`). Clone it into the skills folder of your agent, under the name `faceless-reels`.

### Claude Code

```bash
git clone https://github.com/DrFIRASS/faceless-reels-skill.git ~/.claude/skills/faceless-reels
```

The skill is available in every project. For one project only, clone it into `<your project>/.claude/skills/faceless-reels` instead. Restart Claude Code, then ask "what skills do you have?" to check that `faceless-reels` is listed.

Connect ElevenLabs (and Atlas Cloud if you want the opening shot) as connectors or MCP servers. Without the ElevenLabs connector, the skill uses the ElevenLabs HTTP API with the `ELEVENLABS_API_KEY` environment variable.

### Hermes Agent

```bash
git clone https://github.com/DrFIRASS/faceless-reels-skill.git ~/.hermes/skills/creative/faceless-reels
```

Hermes picks up skills from `~/.hermes/skills/`. Restart Hermes if the skill does not show up. Give Hermes access to ElevenLabs (MCP server, or `ELEVENLABS_API_KEY` for the HTTP API) and, optionally, Atlas Cloud.

### OpenClaw

For all your agents:

```bash
git clone https://github.com/DrFIRASS/faceless-reels-skill.git ~/.openclaw/skills/faceless-reels
```

For one workspace only:

```bash
git clone https://github.com/DrFIRASS/faceless-reels-skill.git <your workspace>/skills/faceless-reels
```

OpenClaw watches its skill folders and loads the new skill automatically. Same ElevenLabs and Atlas Cloud access as above.

### Update

```bash
cd ~/.claude/skills/faceless-reels && git pull
```

(Use the folder where you installed it.)

## Configuration

Copy the example settings and fill them in:

```bash
cd ~/.claude/skills/faceless-reels && cp config.example.json config.json
```

| Key | What to put |
|---|---|
| `creator_name` | Your name, used in reports |
| `language` | Language of your reels: `en`, `fr`, `es`... |
| `elevenlabs_voice_id` | The id of your cloned voice (ElevenLabs, Voices, your voice, "ID") |
| `elevenlabs_model` | The ElevenLabs model to use |
| `whisper_model` | Path to the whisper.cpp model |
| `projects_root` | Folder where your video projects live |
| `cta` | Your closing sentence, in your language |
| `guides_page` | The page in your bio where your guides live |
| `timezone`, `publish_hour`, `caps`, `telegram_env` | Autonomous mode only |

`config.json` is ignored by git, so your settings never end up on GitHub. Never put an API key in it: keys go in environment variables.

**Your cover:** the skill ships a neutral template with a "YOUR PHOTO HERE" placeholder, `assets/cover/cover-template.png` (1080 x 1620). Put your photo in it, keep the top zone, and save it as `cover.png` in your video folder, or replace the template once for all your reels. See `references/cover.md`.

## Usage

Open your agent in a video folder and ask, for example:

- "Make a faceless reel about the 5 Claude settings that change everything."
- "Here is a reel I like: ./reference.mp4. Make me an original one with the same structure, about n8n."
- "Turn this topic into a reel: 3 mistakes beginners make with AI agents."

The agent plans the whole job, announces the cost of the paid steps, and goes to the end. You get, in `_reel/exports/`:

- `<id>.mp4`: the reel, 1080 x 1920, 30 fps, -14 LUFS
- `<id>-cover.jpg` (9:16) and `<id>-cover-2x3.jpg`
- `instagram.md`: caption, hashtags, titles for Shorts and TikTok, a checklist before publishing

Rendering takes 10 to 15 minutes for 90 seconds of video on an M1 Mac.

## Costs

Measured on a reel of 291 words (86 seconds):

| Service | Cost |
|---|---|
| ElevenLabs voice, 2 takes | about 3,400 credits |
| ElevenLabs Scribe timestamps | about 480 credits |
| Atlas Cloud opening shot (optional) | about $1.50 |
| Remotion render | free, on your machine |

The agent announces every paid generation before running it.

## Repository layout

```text
SKILL.md                 Entry point read by the agent
config.example.json      Settings to copy into config.json
references/              Step-by-step guides (script, voice, opening shot, editing, scenes, cover, checks, autonomous mode)
scripts/                 Helper scripts (new project, voice processing, checks, sounds, contact sheets)
assets/reel-template/    The Remotion project copied for each new reel
assets/cover/            Cover template
assets/example-this-voice/   A complete validated reel: script, analysis, brief, scenes
assets/example-6-tools/      Reusable scenes for a ranking or a tiered list
```

## Agent compatibility

The skill follows the standard `SKILL.md` format, so Claude Code, Hermes and OpenClaw can all load it. It was built and tested on **Claude Code**. A few steps use Claude Code features:

- parallel subagents to write the scenes (other agents write them one after the other, same rules);
- the ElevenLabs and Atlas Cloud connectors (other agents use the MCP servers or the HTTP APIs described in `references/voice.md` and `references/opening-shot.md`);
- sending the files back in the chat.

For the best results, use a strong model: writing good scenes is real motion-design work.

## Assets and credits

- The sound effects and the background music are original, generated by `scripts/make_sounds.py`. The music is generated when you create a project.
- The mascot and the empty studio were generated with AI image models for this skill.
- No brand logo is included. Add the logos you need in `public/reel/logos/`, and respect each brand's guidelines.
- Fonts (Space Grotesk, Inter, IBM Plex Mono, Archivo) are loaded from Google Fonts by Remotion.

## Good practice

- Everything the reel says must be true. No invented numbers, no fake screenshots.
- Declare AI-generated content when you publish (TikTok, YouTube).
- Take the structure of a reference reel, never its text, its visuals or its mascot.

## License

MIT. See [LICENSE](LICENSE).
