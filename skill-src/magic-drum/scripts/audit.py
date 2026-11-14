#!/usr/bin/env python3
"""Structural audit of the finished film. Prints PASS/WARN lines + writes audit.json."""
import json, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ffmpeg


def probe(path):
    r = subprocess.run([ffmpeg(), "-i", str(path)], capture_output=True, text=True)
    err = r.stderr
    out = {}
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
    if m:
        out["duration"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    m = re.search(r"Video: .*?, (\d+)x(\d+)", err)
    if m:
        out["w"], out["h"] = int(m.group(1)), int(m.group(2))
    out["has_audio"] = "Audio:" in err
    m = re.search(r"(\d+(?:\.\d+)?) fps", err)
    if m:
        out["fps"] = float(m.group(1))
    return out


def loudness(path):
    r = subprocess.run([ffmpeg(), "-i", str(path), "-map", "0:a", "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    err = r.stderr
    mean = re.search(r"mean_volume: (-?[\d.]+) dB", err)
    peak = re.search(r"max_volume: (-?[\d.]+) dB", err)
    return (float(mean.group(1)) if mean else None, float(peak.group(1)) if peak else None)


def sample_frames(path, every=1.5):
    """Decode frames at 1/every Hz as raw RGB bytes (caller reshapes using w*h*3)."""
    r = subprocess.run([ffmpeg(), "-i", str(path), "-map", "0:v", "-vf", f"fps=1/{every}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    return r.stdout


def main():
    folder, out = Path(sys.argv[1]), sys.argv[2]
    path = folder / out
    report = {"file": str(path)}
    ok = True

    info = probe(path)
    report["streams"] = info
    if not info.get("duration"):
        print("FAIL no video found"); sys.exit(1)
    if not info.get("has_audio"):
        print("WARN no audio stream"); ok = False

    mean_db, peak_db = (None, None)
    if info.get("has_audio"):
        mean_db, peak_db = loudness(path)
        report["loudness"] = {"mean_db": mean_db, "peak_db": peak_db}
        if mean_db is not None and mean_db < -35:
            print(f"WARN very quiet audio (mean {mean_db} dB)"); ok = False
        if peak_db is not None and peak_db > -0.1:
            print(f"WARN clipping risk (peak {peak_db} dB)")

    # frame sampling for blackness / flatness
    buf = sample_frames(path)
    if buf:
        import numpy as np
        # frame size from probe
        w, h = info.get("w", 0), info.get("h", 0)
        if w and h:
            n = len(buf) // (w * h * 3)
            if n:
                frames = np.frombuffer(buf[: n * w * h * 3], dtype=np.uint8).reshape(n, h, w, 3)
                dark = 0
                for i in range(n):
                    m = float(frames[i].mean())
                    s = float(frames[i].std())
                    if m < 7:
                        dark += 1
                        print(f"WARN near-black frame at ~{i * 1.5:.0f}s (mean {m:.1f})"); ok = False
                    if s < 6:
                        print(f"WARN flat frame at ~{i * 1.5:.0f}s (std {s:.1f})")
                report["frames_sampled"] = n
                report["dark_frames"] = dark

    meta_p = folder / "meta.json"
    if meta_p.exists():
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        want = meta["dur"] + 0.4
        got = info["duration"]
        report["duration_vs_plan"] = {"planned": want, "actual": got}
        if abs(got - want) > max(1.0, want * 0.08):
            print(f"WARN duration off: planned {want:.1f}s, got {got:.1f}s"); ok = False

    report["result"] = "PASS" if ok else "WARN"
    (folder / "audit.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    print(f"audit: {report['result']} ({info.get('w')}x{info.get('h')}, {info['duration']:.1f}s, {mean_db} dB mean)")
    sys.exit(0)


if __name__ == "__main__":
    main()
