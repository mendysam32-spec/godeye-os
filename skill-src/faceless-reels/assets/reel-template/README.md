# Reel template

Remotion project of the `faceless-reels` skill. It is copied to `_reel/remotion/` for each new reel. Commands, from this folder:

```bash
python3 <skill>/scripts/fake_words.py  # optional: fake voice and words, to check the edit before generating the real voice
python3 scripts/build_reel.py          # read reel.json and the voice, generate src/reel/data.ts and src/reel/CUES.md
npx remotion studio                    # preview
zsh scripts/render_final.sh            # reel, cover, assembly, exports
zsh scripts/render_final.sh --skip-reel   # cover and assembly only
```

Files to edit for a reel: `reel.json`, `src/reel/scenes/`, `src/reel/BRIEF.md`. The rest does not change.

Inputs the project expects:
- `public/reel/voice.wav` and `../voice/scribe_words.json` (the voice and its word timings)
- `public/reel/cover_base_9x16.png` and `public/reel/cover_base_2x3.png`, made by `scripts/prep_cover.py` from a 1080 x 1620 cover background
- `public/sfx/*.wav` and `public/music/soft.wav`, made by `scripts/make_sounds.py`
- optional: `public/reel/hook.mp4` (opening shot, with `"hook": {"video": true}`) and square logos in `public/reel/logos/<name>.png`, listed in `cover.logos`
