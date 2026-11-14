"""Shared helpers for Magic Drum. Same patterns as Stickman: pathlib + subprocess lists."""
import os, shutil, sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
GL_ARGS = ["--use-angle=swiftshader", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
BROWSER_ARGS = GL_ARGS + ["--allow-file-access-from-files"]
FPS_DEFAULT = 24


def ffmpeg():
    """System ffmpeg if present, else the binary shipped with imageio-ffmpeg."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit("ffmpeg not found. Run scripts/doctor.py first.")


def page_url(folder):
    return (Path(folder).resolve() / "index.html").as_uri()


def run(cmd, **kw):
    import subprocess
    return subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)


def run_bin(cmd, **kw):
    """Like run() but stdout/stderr stay bytes (for piping raw audio)."""
    import subprocess
    return subprocess.run([str(c) for c in cmd], capture_output=True, **kw)


def write_data_js(folder, spec, speech):
    """Write engine/data.js. fetch() fails on file:// so the spec is baked into the page."""
    def dump(o):
        return json_dumps_compact(o).replace("</", "<\\/")
    body = f"window.SPEC = {dump(spec)};\nwindow.SPEECH = {dump(speech)};\n"
    (Path(folder) / "data.js").write_text(body, encoding="utf-8")


def json_dumps_compact(o):
    import json
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))


def load_spec(folder):
    import json
    p = Path(folder) / "film.json"
    if not p.exists():
        sys.exit(f"film.json not found in {folder}")
    return json.loads(p.read_text(encoding="utf-8"))


def read_wav_f32(path):
    """Decode any audio file to float32 mono samples at 48k via ffmpeg."""
    import numpy as np
    r = run_bin([ffmpeg(), "-v", "error", "-i", path, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"])
    if r.returncode != 0:
        raise RuntimeError(f"decode failed: {path}: {r.stderr[-300:]}")
    a = np.frombuffer(r.stdout, dtype=np.float32).copy()
    return a, 48000


def write_wav_f32(path, samples, rate=48000):
    """Encode float32 mono samples to an audio file via ffmpeg."""
    import numpy as np
    data = np.clip(samples, -1.0, 1.0).astype(np.float32).tobytes()
    r = run_bin([ffmpeg(), "-v", "error", "-y", "-f", "f32le", "-ar", str(rate), "-ac", "1", "-i", "-",
                 "-c:a", "pcm_s16le" if str(path).endswith(".wav") else "aac", str(path)], input=data)
    if r.returncode != 0:
        raise RuntimeError(f"encode failed: {path}: {r.stderr[-300:]}")
