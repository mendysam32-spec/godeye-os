#!/usr/bin/env python3
"""Voice stage: edge-tts synthesis with word-boundary timestamps.

For each line in film.json:
  - synthesize free neural speech (or pass through a user-provided audio file)
  - keep per-word cues -> drives viseme lip-sync in the engine
  - compute a speech-energy envelope -> drives mouth amplitude + head bob
  - attach gestures (explicit from spec, or auto-suggested from keywords/punctuation)

Output: <folder>/speech.json  { lines: [...] }  consumed by build.py.
"""
import asyncio, hashlib, json, re, sys, wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ffmpeg, read_wav_f32, run, FPS_DEFAULT

DEFAULT_VOICE = "en-US-GuyNeural"


def _hash_key(text, voice, rate, pitch, volume):
    h = hashlib.sha1(f"{voice}|{rate}|{pitch}|{volume}|{text}".encode("utf-8")).hexdigest()[:16]
    return h


async def _synthesize(text, voice, rate, pitch, volume, out_mp3, boundary="WordBoundary"):
    import edge_tts
    c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume, boundary=boundary)
    cues = []
    with open(out_mp3, "wb") as f:
        async for chunk in c.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                cues.append([round(chunk["offset"] / 1e7, 3), round(chunk["duration"] / 1e7, 3), chunk["text"]])
    return cues


def _cues_via_whisper(word_cues_fallback):
    return word_cues_fallback


def _mp3_to_wav(mp3_path, wav_path):
    r = run([ffmpeg(), "-v", "error", "-y", "-i", mp3_path, "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", wav_path])
    if r.returncode != 0:
        raise RuntimeError("mp3->wav failed: " + r.stderr[-300:])


def _wav_duration(path):
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def _envelope(wav_path, fps):
    """Speech energy per frame bin, 0..100 ints. Abs amplitude -> window mean -> p95 normalize."""
    import numpy as np
    with wave.open(str(wav_path), "rb") as w:
        rate = w.getframerate()
        n = w.getnframes()
        a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768.0
    if a.size == 0:
        return [0], 0.0
    win = max(1, int(round(rate / fps / 2)))
    k = a.size // win
    env = np.abs(a[: k * win]).reshape(k, win).mean(axis=1) if k else np.array([float(np.abs(a).mean())])
    p95 = float(np.percentile(env, 95)) or 1.0
    env = np.clip(env / p95, 0, 1)
    return [int(round(x * 100)) for x in env], a.size / rate


# ------------------------------- gestures --------------------------------

WAVE_WORDS = re.compile(r"\b(hi|hello|hey|greetings|good ?(morning|afternoon|evening)|bye|goodbye|farewell|welcome)\b", re.I)
POINT_WORDS = re.compile(r"\b(look|there|that|this|here|see|watch|behold|the .*(sky|city|screen|moon|sun))\b", re.I)
NEG_WORDS = re.compile(r"\b(no|not|never|don'?t|can'?t|won'?t|isn'?t|aren'?t|stop)\b", re.I)
AGREE_WORDS = re.compile(r"\b(yes|yeah|okay|ok|right|exactly|great|wonderful|perfect|sure|indeed|of course)\b", re.I)
THINK_WORDS = re.compile(r"\b(hmm+|maybe|perhaps|wonder|what if|i ?guess|let me think)\b", re.I)


def auto_gestures(text, dur):
    """Small deterministic set: one or two gestures per line, timed inside it."""
    out = []
    if dur < 0.9:
        return out
    if WAVE_WORDS.search(text):
        out.append({"clip": "wave", "at": 0.05, "dur": min(2.0, max(1.2, dur * 0.6))})
    if THINK_WORDS.search(text):
        out.append({"clip": "think", "at": dur * 0.25, "dur": min(2.4, dur * 0.55)})
    if NEG_WORDS.search(text):
        out.append({"clip": "shake", "at": dur * 0.35, "dur": 1.1})
    elif AGREE_WORDS.search(text) or "!" in text:
        out.append({"clip": "nod", "at": dur * 0.45, "dur": 1.1})
    if POINT_WORDS.search(text) and len(out) < 2:
        out.append({"clip": "point", "at": dur * 0.3, "dur": 1.2})
    if len(out) < 2 and dur > 3.2:  # long line: one beat for life
        out.append({"clip": "nod", "at": dur * 0.62, "dur": 0.9})
    return out


# --------------------------------- main -----------------------------------

def synthesize_lines(folder, spec, fps=None):
    fps = fps or (spec.get("style", {}).get("fps") or FPS_DEFAULT)
    voices = {c.get("name"): c.get("voice") for c in spec.get("cast", [])}
    pitches = {c.get("name"): c.get("pitch", "+0Hz") for c in spec.get("cast", [])}
    cache = Path(folder) / "audio" / "cache"
    cache.mkdir(parents=True, exist_ok=True)

    lines = []
    for i, ln in enumerate(spec.get("lines", [])):
        who = ln.get("who") or (spec.get("cast", [{}])[0].get("name") if spec.get("cast") else "")
        text = ln.get("text", "").strip()
        at = float(ln.get("at", 0.0))
        if not text:
            continue
        if ln.get("audio"):  # user-supplied voiceover passthrough
            src = Path(folder) / ln["audio"]
            if not src.exists():
                src = Path(ln["audio"])
            wav = cache / f"line-{i:02d}.wav"
            r = run([ffmpeg(), "-v", "error", "-y", "-i", src, "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", wav])
            if r.returncode != 0:
                raise RuntimeError("user audio failed: " + r.stderr[-200:])
            dur = _wav_duration(wav)
            env, _ = _envelope(wav, fps)
            cues = [[k / fps, 1.2 / fps, w] for k, w in enumerate(re.findall(r"[A-Za-z']+", text))][: max(1, int(dur * 3))]
            lines.append({"who": who, "t0": round(at, 3), "t1": round(at + dur, 3), "file": f"audio/cache/line-{i:02d}.wav",
                          "gain": ln.get("gain", 1.0), "cues": cues, "env": env,
                          "emotion": ln.get("emotion", "neutral"), "gestures": ln.get("gestures") or auto_gestures(text, dur)})
            continue

        voice = ln.get("voice") or voices.get(who) or DEFAULT_VOICE
        rate = ln.get("rate", "+0%")
        pitch = ln.get("pitch") or pitches.get(who, "+0Hz")
        volume = ln.get("volume", "+0%")
        key = _hash_key(text, voice, rate, pitch, volume)
        mp3 = cache / f"{key}.mp3"
        wav = cache / f"{key}.wav"
        cj = cache / f"{key}.json"
        if not (mp3.exists() and wav.exists() and cj.exists()):
            cues = asyncio.run(_synthesize(text, voice, rate, pitch, volume, mp3))
            _mp3_to_wav(mp3, wav)
            dur = _wav_duration(wav)
            env, _ = _envelope(wav, fps)
            cj.write_text(json.dumps({"cues": cues, "dur": dur, "env": env}), encoding="utf-8")
        else:
            d = json.loads(cj.read_text(encoding="utf-8"))
            cues, dur, env = d["cues"], d["dur"], d["env"]

        # cues become absolute film times (audio starts at `at`)
        abs_cues = [[round(at + c[0], 3), c[1], c[2]] for c in cues]
        gestures = ln.get("gestures")
        if not gestures and ln.get("gesture"):
            gestures = [{"clip": ln["gesture"], "at": 0.1, "dur": 1.4}]
        if not gestures:
            gestures = auto_gestures(text, dur)
        lines.append({"who": who, "t0": round(at, 3), "t1": round(at + dur, 3), "file": f"audio/cache/{key}.wav",
                      "gain": ln.get("gain", 1.0), "cues": abs_cues, "env": env,
                      "emotion": ln.get("emotion", "neutral"), "gestures": gestures})

    lines.sort(key=lambda l: l["t0"])
    out = Path(folder) / "speech.json"
    out.write_text(json.dumps({"lines": lines}, ensure_ascii=False), encoding="utf-8")
    print(f"speech: {len(lines)} lines -> {out.name}")
    return {"lines": lines}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: speech.py <film-folder>")
    folder = sys.argv[1]
    spec = json.loads((Path(folder) / "film.json").read_text(encoding="utf-8"))
    synthesize_lines(folder, spec)
