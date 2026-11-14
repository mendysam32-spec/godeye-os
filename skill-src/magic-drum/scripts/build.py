#!/usr/bin/env python3
"""One command from film folder to checked MP4.

usage: build.py <folder> [--out name.mp4] [--shots N ...] [--audio-only]
                [--stills] [--jobs N] [--crf 20]

Pipeline: normalize spec -> neural speech + cues -> stage engine copy ->
META from page -> parallel shot rendering (resume-friendly, one file per
shot) -> music/SFX mix with sidechain ducking -> concat + mux -> audit.
"""
import argparse, base64, json, multiprocessing as mp, os, shutil, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import speech as speech_mod
from common import BROWSER_ARGS, ffmpeg, page_url, write_data_js

SCRIPTS = Path(__file__).resolve().parent
SKILL = SCRIPTS.parent
ENGINE = SKILL / "engine"
FRAME_JS = "i => renderAt(i)"

DEFAULT_VOICES = ["en-US-GuyNeural", "en-US-AriaNeural", "en-GB-RyanNeural", "en-US-JennyNeural", "en-AU-WilliamNeural", "en-US-EricNeural"]


def normalize(spec):
    """Fill defaults so a small hand-written film.json just works."""
    spec = json.loads(json.dumps(spec))  # deep-ish copy
    style = spec.setdefault("style", {})
    style.setdefault("mode", "pbr")
    style.setdefault("grade", "warm")
    style.setdefault("fps", 24)
    style.setdefault("size", [1280, 720])
    style.setdefault("bloom", 0.45)
    fps = style["fps"]

    cast = spec.setdefault("cast", [])
    for i, c in enumerate(cast):
        c.setdefault("name", f"char{i}")
        c.setdefault("archetype", "critter")
        c.setdefault("voice", DEFAULT_VOICES[i % len(DEFAULT_VOICES)])

    # end of film = last of scene end / shot end / last line end
    lines = spec.get("lines", [])
    end = 0.0
    for l in lines:
        end = max(end, float(l.get("at", 0)) + 8.0)
    for m in spec.get("moves", []):
        end = max(end, m["at"][1])
    for s in spec.get("sits", []):
        end = max(end, s["at"][1])

    scenes = spec.get("scenes", [])
    if scenes:
        scenes.sort(key=lambda s: s.get("from", 0))
        scenes[0]["from"] = 0
        for a, b in zip(scenes, scenes[1:]):
            a["to"] = b.get("from", a.get("to", 0))
        end = max(end, scenes[-1].get("to", 0))
    else:  # single default street scene
        scenes = [{"type": "street", "from": 0, "to": max(end, 8), "cast": {}}]
        spec["scenes"] = scenes
        end = max(end, scenes[-1]["to"])
    for s in scenes:
        s.setdefault("cast", {})
    dur = end

    shots = spec.get("shots", [])
    if not shots:
        shots = [{"at": [0, dur], "cam": "medium", "who": cast[0]["name"] if cast else None}]
        spec["shots"] = shots
    shots.sort(key=lambda s: s["at"][0])
    shots[0]["at"][0] = 0
    for a, b in zip(shots, shots[1:]):
        a["at"][1] = b["at"][0]
    shots[-1]["at"][1] = dur

    # engine SPEC: everything except lines (lines become SPEECH)
    eng = {k: spec[k] for k in ("style", "cast", "scenes", "shots", "moves", "sits", "sfx") if k in spec}
    if "surface" in spec:
        eng["surface"] = spec["surface"]
    return spec, eng, dur, fps


def stage(folder):
    """Fresh engine copy + data.js so films never touch the skill's own files."""
    stage_dir = Path(folder) / "stage"
    if stage_dir.exists():
        shutil.rmtree(stage_dir)
    shutil.copytree(ENGINE, stage_dir)
    return stage_dir


def info(folder):
    from playwright.sync_api import sync_playwright
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=BROWSER_ARGS)
        g = b.new_page(viewport={"width": 800, "height": 500})
        g.on("pageerror", lambda e: errs.append(str(e)))
        g.goto(page_url(folder))
        try:
            g.wait_for_function("window.READY === true", timeout=120000)
        except Exception:
            sys.exit("engine did not load: " + "; ".join(errs[:3]))
        d = g.evaluate("window.META")
        b.close()
    return d, errs


def worker(a):
    """Render a bucket of shots. Own page per process; images piped straight to ffmpeg."""
    folder, shots, cuts, tmp, w, h, fps = a
    from playwright.sync_api import sync_playwright
    os.chdir(folder)
    with sync_playwright() as p:
        b = p.chromium.launch(args=BROWSER_ARGS)
        g = b.new_page(viewport={"width": w + 40, "height": h + 40})
        g.goto(page_url("stage"))
        g.wait_for_function("window.READY === true", timeout=120000)
        for sh in shots:
            t_ = Path(tmp) / f"tmp_{sh:03d}.mp4"
            ff = subprocess.Popen(
                [ffmpeg(), "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps),
                 "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "veryfast",
                 "-crf", "18", "-pix_fmt", "yuv420p", "-g", str(fps * 2), str(t_)],
                stdin=subprocess.PIPE)
            n = 0
            for i in range(cuts[sh], cuts[sh + 1]):
                r = g.evaluate(FRAME_JS, i)
                ff.stdin.write(base64.b64decode(r.split(",", 1)[1]))
                n += 1
            ff.stdin.close()
            if ff.wait() == 0 and n > 0:
                os.replace(t_, Path(tmp) / f"shot_{sh:03d}.mp4")
                print(f"shot {sh} done ({n} frames)", flush=True)
            else:
                print(f"shot {sh} FAILED", flush=True)
        b.close()


def stills(folder, meta, stage_dir, count=6):
    """Save a few JPEG stills for eyeballing (also used by audit-lite)."""
    from playwright.sync_api import sync_playwright
    out = Path(folder) / "stills"
    out.mkdir(exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(args=BROWSER_ARGS)
        g = b.new_page(viewport={"width": 800, "height": 500})
        g.goto(page_url(stage_dir))
        g.wait_for_function("window.READY === true", timeout=120000)
        n = meta["frames"]
        for k in range(count):
            i = int(n * (k + 0.5) / count)
            d = g.evaluate(f"renderAt({i})")
            (out / f"still-{i:04d}.jpg").write_bytes(base64.b64decode(d.split(",", 1)[1]))
        b.close()
    print(f"stills: {count} frames -> {out}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--out", default="film.mp4")
    ap.add_argument("--shots", nargs="*", type=int)
    ap.add_argument("--audio-only", action="store_true")
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--jobs", type=int, default=0)
    ap.add_argument("--crf", type=int, default=20)
    o = ap.parse_args()
    folder = Path(o.folder).resolve()
    parts = folder / "shots"
    parts.mkdir(exist_ok=True)

    spec = json.loads((folder / "film.json").read_text(encoding="utf-8"))
    spec, eng, dur, fps = normalize(spec)
    (folder / "film.normalized.json").write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")

    sp = speech_mod.synthesize_lines(folder, spec, fps)
    stage_dir = stage(folder)
    write_data_js(stage_dir, eng, sp)

    meta, errs = info(stage_dir)
    (folder / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    print("META:", json.dumps(meta))

    if o.stills:
        stills(folder, meta, stage_dir)

    subprocess.run([sys.executable, str(SCRIPTS / "mix.py"), str(folder)], check=True)

    if not o.audio_only:
        # META cuts are in seconds -> frame indices
        cut_frames = [0] + sorted({round(c * meta["fps"]) for c in meta["cuts"] if 0 < c < meta["dur"]}) + [meta["frames"]]
        cut_frames = sorted(set(cut_frames))
        n_shots = len(cut_frames) - 1
        todo = list(o.shots) if o.shots else [s for s in range(n_shots) if not (parts / f"shot_{s:03d}.mp4").exists()]
        for s in todo:
            (parts / f"shot_{s:03d}.mp4").unlink(missing_ok=True)
        jobs = o.jobs or min(os.cpu_count() or 2, max(len(todo), 1), 6)
        buckets = [[] for _ in range(jobs)]
        load = [0] * jobs
        for s in sorted(todo, key=lambda s: cut_frames[s + 1] - cut_frames[s]):
            k = load.index(min(load))
            buckets[k].append(s)
            load[k] += cut_frames[s + 1] - cut_frames[s]
        if todo:
            with mp.get_context("spawn").Pool(jobs) as pool:
                pool.map(worker, [(str(folder), sorted(b), cut_frames, str(parts), meta["w"], meta["h"], meta["fps"]) for b in buckets if b])
        missing = [s for s in range(n_shots) if not (parts / f"shot_{s:03d}.mp4").exists()]
        if missing:
            sys.exit(f"shots not rendered: {missing}. Run the same command again to resume.")
        lst = folder / "list.txt"
        lst.write_text("".join(f"file 'shots/shot_{s:03d}.mp4'\n" for s in range(n_shots)))
        f = ffmpeg()
        subprocess.run([f, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "silent.mp4"], cwd=folder, check=True)
        subprocess.run([f, "-y", "-loglevel", "error", "-i", "silent.mp4", "-i", "audio/mix.wav",
                        "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", str(o.crf),
                        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", o.out],
                       cwd=folder, check=True)

    subprocess.run([sys.executable, str(SCRIPTS / "audit.py"), str(folder), o.out], check=False)
    print("OUTPUT", folder / o.out)


if __name__ == "__main__":
    main()
