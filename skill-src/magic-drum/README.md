# Magic Drum

Cinematic 2D/3D animated films from one `film.json` — the successor to Stickman.

**What it does:** stylized-PBR 3D characters (Pixar-lite) with procedural expressive
faces (viseme lip-sync, blinks, emotions), gestures, film cameras (wide→ecu, two-shot,
OTS, inserts, dolly/pan/orbit/crane, handheld), color grades + bloom + grain, free
neural voices with word-timestamp lip-sync, synthesized music beds with sidechain
ducking, CC0 footsteps/doors/impacts, and an automatic structural audit.

**Flow:** `doctor.py` once → write `film.json` → `build.py <folder> --stills --jobs 4`.
Parallel per-shot rendering with resume. A 20 s film ≈ 5–10 min on a modest
dual-core machine (faster with `[960,540]` or more cores).

- `engine/` — vendored three@0.187 + engine modules (offline, no CDN)
- `scripts/` — doctor, speech (edge-tts), mix (audio DSP), build, audit
- `sfx/` — CC0 one-shots (Kenney audio pack)
- `examples/` — `cafe-evening` (two chars, two scenes) and `the-idea` (monologue)

License: engine and scripts MIT-style project code; SFX CC0; voices via Microsoft
edge-tts free service; three.js MIT.
