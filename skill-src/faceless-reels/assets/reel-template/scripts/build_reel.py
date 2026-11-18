#!/usr/bin/env python3
# Generates src/reel/data.ts and src/reel/CUES.md from reel.json (script text, settings) and the ElevenLabs Scribe words (timing).
# The voice is never cut: the whole reel timeline follows public/reel/voice.wav directly.
# Usage: python3 scripts/build_reel.py   (from the Remotion project)
import difflib
import json
import math
import os
import re
import unicodedata
import wave

import numpy as np

FPS = 30
CONFIG = 'reel.json'
WORDS = '../voice/scribe_words.json'
VOICE = 'public/reel/voice.wav'
OUTPUT = 'src/reel/data.ts'
CUES = 'src/reel/CUES.md'
NBSP = '\u00a0'
PAGE_MAX = 18  # captions, in characters
HOOK_LINE_MAX = 15  # big hook words, per line

# Number words kept with the next word in a caption page ("three settings" never splits), per reel language.
# Digits are always kept with the next word. Add a language here to give it the same rule.
NUMBER_WORDS = {
    'fr': {'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingt'},
    'en': {'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'},
}
LANG = 'en'  # set from reel.json in main()


def norm(t):
    t = t.lower().replace('\u2019', "'")
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')
    return re.sub(r"[^a-z0-9'-]", '', t)


def is_number(t):
    # a number followed by punctuation ("this one, remember") ends its phrase: it is not kept with the next word
    if re.search(r'[.,:;?!…]$', t):
        return False
    return bool(re.fullmatch(r'\d+', t)) or norm(t) in NUMBER_WORDS.get(LANG, set())


def tokens(text):
    # A lone ": ? ! ;" sticks to the previous word. In French it keeps the non-breaking space of French typography
    # ("montage :" stays one token); in other languages it is glued without a space.
    glue = NBSP if LANG == 'fr' else ''
    out = []
    for b in text.split():
        if b in (':', '?', '!', ';') and out:
            out[-1] += glue + b
        else:
            out.append(b)
    return out


def section_order(sections):
    order = [('hook', sections['hook']), ('stakes', sections['stakes'])]
    order += [(f'e{i + 1}', t) for i, t in enumerate(sections['elements'])]
    order += [('recap', sections['recap']), ('cta', sections['cta']), ('outro', sections['outro'])]
    return order


def align(script):
    words = json.load(open(WORDS))['words']
    words = [m for m in words if m.get('type', 'word') == 'word' and norm(m['text'])]
    a = [norm(m['text']) for m in words]
    b = [norm(s) for s in script]
    res = [None] * len(script)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == 'equal' or (tag == 'replace' and i2 - i1 == j2 - j1):
            for k in range(j2 - j1):
                res[j1 + k] = words[i1 + k]
            if tag == 'replace':
                print('  replaced:', [m['text'] for m in words[i1:i2]], '->', script[j1:j2])
        else:
            print('  WARNING mismatch:', tag, [m['text'] for m in words[i1:i2]], '->', script[j1:j2])
    # token without timing: interpolate it between its neighbors
    for j, m in enumerate(res):
        if m is None:
            prev = next((x for x in reversed(res[:j]) if x), {'end': 0.0})
            nxt = next((x for x in res[j + 1:] if x), {'start': prev['end'] + 0.3})
            res[j] = {'start': prev['end'], 'end': nxt['start']}
            print('  interpolated:', script[j])
    return [{'t': s, 's': float(m['start']), 'e': float(m['end'])} for s, m in zip(script, res)]


def frames(words):
    for m in words:
        m['f'] = int(math.floor(m['s'] * FPS))
        m['g'] = int(math.ceil(m['e'] * FPS))
    return words


def on_screen(words, table):
    """Words as written on screen: `table` replaces one or more spoken words ("five" -> 5, "eleven labs" -> ElevenLabs)."""
    table = {' '.join(norm(x) for x in k.split()): v for k, v in table.items()}
    out = []
    i = 0
    while i < len(words):
        for n in (3, 2, 1):
            key = ' '.join(norm(m['t']) for m in words[i:i + n])
            if len(words[i:i + n]) == n and key in table:
                m = dict(words[i])
                last = words[i + n - 1]
                m['t'] = table[key] + re.sub(r"^[^.,:?!… ]*", '', last['t'])
                m['e'] = last['e']
                m['g'] = last['g']
                out.append(m)
                i += n
                break
        else:
            out.append(dict(words[i]))
            i += 1
    return out


def length(p):
    return sum(len(x['t']) for x in p) + max(0, len(p) - 1)


def pages(words, start, end):
    """Splits captions into pages: 18 characters at most, a break after punctuation past 9 characters, on pauses and sections.
    A number (digits, or a number word of the reel language) always starts a page with the word after it."""
    res = []
    cur = []
    for m in words:
        if m['f'] < start or m['f'] >= end:
            continue
        if cur and (length(cur + [m]) > PAGE_MAX or m['s'] - cur[-1]['e'] > 1.0 or is_number(m['t'])):
            res.append(cur)
            cur = []
        cur.append(m)
        if re.search(r'[.?!…]$', m['t']) or (length(cur) > 9 and re.search(r'[,:]$', m['t'])):
            res.append(cur)
            cur = []
    if cur:
        res.append(cur)
    # no single word when it can be avoided: a short lone word moves up to the previous page if it fits
    i = 0
    while i < len(res) - 1:
        if len(res[i + 1]) == 1 and length(res[i]) + 1 + len(res[i + 1][0]['t']) <= PAGE_MAX and not re.search(r'[.?!]$', res[i][-1]['t']) and not is_number(res[i + 1][0]['t']):
            res[i] = res[i] + res[i + 1]
            del res[i + 1]
        else:
            i += 1
    return res


def hook_pages(words, hook_end):
    """Big hook words: two lines per page, a sentence only spills onto the next page when it is too long."""
    pages_h = []
    lines = []
    line = []

    def close_page():
        nonlocal lines, line
        if line:
            lines.append(line)
            line = []
        if lines:
            pages_h.append(lines)
            lines = []

    for m in [x for x in words if x['f'] < hook_end]:
        if line and length(line + [m]) > HOOK_LINE_MAX:
            lines.append(line)
            line = []
            if len(lines) == 2:
                close_page()
        line.append(m)
        if re.search(r'[.?!…:]$', m['t']):
            close_page()
    close_page()
    out = []
    for k, p in enumerate(pages_h):
        start = p[0][0]['f'] - 1
        end = pages_h[k + 1][0][0]['f'] - 1 if k + 1 < len(pages_h) else hook_end
        out.append({'start': start, 'end': end, 'lines': [[{'t': m['t'], 'at': m['f']} for m in l] for l in p]})
    return out


def envelope(total):
    w = wave.open(VOICE)
    n = w.getnframes()
    rate = w.getframerate()
    width = w.getsampwidth()
    channels = w.getnchannels()
    raw = w.readframes(n)
    if width == 3:
        a = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        x = (a[:, 0].astype(np.int32) | (a[:, 1].astype(np.int32) << 8) | (a[:, 2].astype(np.int32) << 16))
        x = np.where(x >= 2 ** 23, x - 2 ** 24, x).astype(np.float32) / 2 ** 23
    else:
        x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    if channels > 1:
        x = x.reshape(-1, channels).mean(axis=1)
    step = rate / FPS
    env = []
    for f in range(total):
        a = int(f * step)
        b = int((f + 1) * step)
        seg = x[a:b]
        env.append(float(np.sqrt(np.mean(seg ** 2))) if len(seg) else 0.0)
    env = np.array(env)
    loud = env[env > 1e-4]
    ref = np.percentile(loud, 95) if len(loud) else 1.0
    env = np.clip(env / ref, 0, 1) ** 0.75
    # light smoothing: fast attack, soft release
    smooth = []
    v = 0.0
    for e in env:
        v = e if e > v else v * 0.62 + e * 0.38
        smooth.append(v)
    return [int(round(v * 100)) for v in smooth]


def check_config(cfg, words_by_section):
    """Checks at build time what would otherwise break the render: missing trigger words, logos without a file."""
    errors = []

    def cue(sec, word, n=1):
        found = sum(1 for t in words_by_section[sec] if norm(t) == norm(word))
        if found < (n or 1):
            errors.append(f'trigger word missing from {sec}: "{word}" (occurrence {n or 1}, {found} found)')

    for t in cfg['stakes']['titles']:
        cue('stakes', t['word'], t.get('n'))
    cue('stakes', cfg['stakes']['boxes_word'])
    for l in cfg['recap']['lines']:
        cue('recap', l['word'], l.get('n'))
    if cfg['recap'].get('strike'):
        cue('recap', cfg['recap']['strike']['word'])
    cue('recap', cfg['recap']['peak']['word'], cfg['recap']['peak'].get('n'))
    for word in cfg['guide']['words'].values():
        cue('cta', word)
    if len(cfg['cover'].get('logos', [])) > 2:
        errors.append('cover.logos: 2 logos at most')
    for name in cfg['cover'].get('logos', []):
        if not os.path.exists(f'public/reel/logos/{name}.png'):
            errors.append(f'logo without a file: public/reel/logos/{name}.png (add the file or remove "{name}" from cover.logos)')
    if cfg['hook']['video'] and not os.path.exists('public/reel/hook.mp4'):
        errors.append('hook.video is true but public/reel/hook.mp4 is missing')
    if errors:
        raise SystemExit('fix reel.json:\n  ' + '\n  '.join(errors))


def main():
    global LANG
    cfg = json.load(open(CONFIG))
    LANG = cfg.get('language', 'en')
    order = section_order(cfg['sections'])
    by_section = [(name, tokens(t)) for name, t in order]
    script = [j for _, js in by_section for j in js]
    check_config(cfg, dict(by_section))
    print('Alignment:')
    words = frames(align(script))
    w = wave.open(VOICE)
    total = int(math.ceil(w.getnframes() / w.getframerate() * FPS))

    # Sections: each change falls on the first word of the section
    bounds = []
    k = 0
    for name, js in by_section:
        bounds.append((name, 0 if k == 0 else words[k]['f']))
        k += len(js)
    sections = {}
    for i, (name, f) in enumerate(bounds):
        sections[name] = {'from': f, 'to': bounds[i + 1][1] if i + 1 < len(bounds) else total}
    elements = [name for name, _ in order if re.fullmatch(r'e\d+', name)]
    if len(cfg['headers']) != len(elements):
        raise SystemExit(f"{len(elements)} elements in the text, {len(cfg['headers'])} headers in reel.json")

    screen = on_screen(words, cfg.get('display', {}))
    main_pages = []
    for name, sec in sections.items():
        if name != 'hook':
            main_pages += pages(screen, sec['from'], sec['to'])
    data_pages = []
    for i, p in enumerate(main_pages):
        start = p[0]['f'] - 1
        end = main_pages[i + 1][0]['f'] - 1 if i + 1 < len(main_pages) else total
        end = min(end, p[-1]['g'] + 14)
        data_pages.append({'start': start, 'end': end, 'words': [{'t': m['t'], 'at': m['f']} for m in p]})

    hook = hook_pages(screen, sections['hook']['to'])
    env = envelope(total)

    js = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
    words_ts = [{'t': m['t'], 'f': m['f'], 'g': m['g']} for m in words]
    settings = {k: v for k, v in cfg.items() if k not in ('sections', 'display')}
    with open(OUTPUT, 'w') as out:
        out.write('// Generated by scripts/build_reel.py: do not edit by hand.\n')
        out.write("import type {ReelConfig} from './config-type';\n\n")
        out.write(f'export const FPS = {FPS};\nexport const TOTAL = {total};\n')
        out.write(f'export const SECTIONS = {js(sections)} as const;\n')
        out.write('export type SectionId = keyof typeof SECTIONS;\n')
        out.write(f'export const ELEMENTS: SectionId[] = {js(elements)};\n')
        out.write(f'export const CONFIG: ReelConfig = {js(settings)};\n')
        out.write(f'export const WORDS: {{t: string; f: number; g: number}}[] = {js(words_ts)};\n')
        out.write(f'export const PAGES: {{start: number; end: number; words: {{t: string; at: number}}[]}}[] = {js(data_pages)};\n')
        out.write(f'export const HOOK_PAGES: {{start: number; end: number; lines: {{t: string; at: number}}[][]}}[] = {js(hook)};\n')
        out.write(f'export const ENV: number[] = {js(env)};\n')

    with open(CUES, 'w') as out:
        out.write('# Word cues (frames local to each section, 30 fps)\n\n')
        out.write("`const c = cues('e1')` then `c('site')` gives the local frame of the word; `c('setting', 2)` the 2nd occurrence in the section.\n\n")
        for name, s in sections.items():
            out.write(f"## {name}: frames {s['from']} to {s['to']} ({s['to'] - s['from']} frames, {(s['to'] - s['from']) / FPS:.1f} s)\n\n")
            line = [f"{m['t'].replace(NBSP, ' ')} +{m['f'] - s['from']}" for m in words if s['from'] <= m['f'] < s['to']]
            out.write(' · '.join(line) + '\n\n')

    print('total', total, 'frames', round(total / FPS, 2), 's')
    for name, s in sections.items():
        print(f"  {name:6} {s['from']:5} -> {s['to']:5}  {(s['to'] - s['from']) / FPS:5.1f} s")
    print('pages', len(data_pages))
    for p in data_pages:
        print('  ', ' '.join(w['t'] for w in p['words']).replace(NBSP, '~'))
    print('hook:')
    for p in hook:
        print('  ', ' / '.join(' '.join(w['t'] for w in l) for l in p['lines']))


if __name__ == '__main__':
    main()
