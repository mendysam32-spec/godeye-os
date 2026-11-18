#!/usr/bin/env python3
# Builds src/reel/data.ts and src/reel/CUES.md from the ElevenLabs Scribe words (timing) and the script text (spelling).
# The voice is never cut: the whole reel timeline follows public/reel/voice.wav directly.
# Usage: python3 scripts/build_reel.py   (from the Remotion project)
# This example was first produced in French; the text below is the English adaptation.
import difflib
import json
import math
import re
import unicodedata
import wave

import numpy as np

FPS = 30
WORDS_FILE = '../voice/scribe_words.json'
VOICE = 'public/reel/voice.wav'
OUTPUT = 'src/reel/data.ts'
CUES_FILE = 'src/reel/CUES.md'

TEXT = """This voice is not me. It's my clone.
The script, the animations, the editing: I didn't touch a thing. Claude did it all.
And yet, my Claude is the same as yours.
The difference? You ask it questions. I give it work.
And for that, you only need five settings.
First setting: the app on your computer. On the website, Claude answers you. On your computer, it acts. It opens your folders, it creates your files, it runs your programs. It built this video directly on my Mac.
Second setting: connectors. In a few clicks, Claude connects to your tools. Your email, your calendar, Notion. I connected it to Eleven Labs. It wrote its text, sent it, and got back this voice. All by itself.
Third setting: skills. A skill is your method, written down once and for all. Claude learns it, and applies it every single time. I put my editing style in it: my colors, my captions, my sound.
Fourth setting: instructions. You tell it once how you work. Your language, your style, what you never want to see again. It remembers, in every conversation.
And the fifth one is where it gets crazy: parallel agents. Claude multiplies. One agent writes a scene, another builds the next one, a third checks everything. At the same time.
It acts. It connects. It learns. It remembers. It multiplies.
It's not a chatbot anymore. It's your team.
Save this video, you're going to need it. Subscribe to get the guide, then click the link in bio, and type the keyword SETTINGS.
And the next time you hear my voice, remember..."""

NBSP = ' '


def norm(t):
    t = t.lower().replace('’', "'")
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')
    return re.sub(r"[^a-z0-9'-]", '', t)


def script_tokens():
    # A standalone ': ? ! ;' (French typography, "montage :") is glued to the previous word with a non-breaking space.
    # English text has no such tokens, so this changes nothing there.
    raw = TEXT.split()
    out = []
    for b in raw:
        if b in (':', '?', '!', ';') and out:
            out[-1] += NBSP + b
        else:
            out.append(b)
    return out


def align():
    words = json.load(open(WORDS_FILE))['words']
    words = [m for m in words if norm(m['text'])]
    script = script_tokens()
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
            prev = next(x for x in reversed(res[:j]) if x)
            nxt = next(x for x in res[j + 1:] if x)
            res[j] = {'start': prev['end'], 'end': nxt['start']}
            print('  interpolated:', script[j])
    return [{'t': s, 's': float(m['start']), 'e': float(m['end'])} for s, m in zip(script, res)]


def frames(words):
    for m in words:
        m['f'] = int(math.floor(m['s'] * FPS))
        m['g'] = int(math.ceil(m['e'] * FPS))
    return words


def find(words, word, after=0):
    n = norm(word)
    for i in range(after, len(words)):
        if norm(words[i]['t']) == n:
            return i
    raise SystemExit(f'word not found: {word} after {after}')


def display(words):
    """Words as they are written on screen: digits, proper names; two-word brands are merged."""
    out = []
    i = 0
    while i < len(words):
        m = dict(words[i])
        if norm(m['t']) == 'eleven' and i + 1 < len(words) and norm(words[i + 1]['t']) == 'labs':
            nxt = words[i + 1]
            m['t'] = 'ElevenLabs' + re.sub(r'^[^.,:?!]*', '', nxt['t'])
            m['e'] = nxt['e']
            m['g'] = nxt['g']
            i += 1
        elif norm(m['t']) == 'five':
            m['t'] = '5'
        out.append(m)
        i += 1
    return out


def pages(words, start, end):
    """Splits into pages: 18 characters max, breaks after punctuation past 9 characters, on pauses and at sections."""
    res = []
    cur = []
    def length(p):
        return sum(len(x['t']) for x in p) + max(0, len(p) - 1)
    for i, m in enumerate(words):
        if m['f'] < start or m['f'] >= end:
            continue
        if cur and (length(cur + [m]) > 18 or m['s'] - cur[-1]['e'] > 1.0 or m['t'] == '5'):  # "5 settings" stays together
            res.append(cur)
            cur = []
        cur.append(m)
        if re.search(r'[.?!…]$', m['t']) or (length(cur) > 9 and re.search(r'[,:]$', m['t'])):
            res.append(cur)
            cur = []
    if cur:
        res.append(cur)
    # no lone word when it can be avoided: a short isolated word moves up to the previous page when there is room
    i = 0
    while i < len(res) - 1:
        if len(res[i + 1]) == 1 and length(res[i]) + 1 + len(res[i + 1][0]['t']) <= 18 and not re.search(r'[.?!]$', res[i][-1]['t']):
            res[i] = res[i] + res[i + 1]
            del res[i + 1]
        else:
            i += 1
    return res


def envelope(total):
    w = wave.open(VOICE)
    n = w.getnframes()
    rate = w.getframerate()
    width = w.getsampwidth()
    raw = w.readframes(n)
    if width == 3:
        a = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        x = (a[:, 0].astype(np.int32) | (a[:, 1].astype(np.int32) << 8) | (a[:, 2].astype(np.int32) << 16))
        x = np.where(x >= 2 ** 23, x - 2 ** 24, x).astype(np.float32) / 2 ** 23
    else:
        x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    step = rate / FPS
    env = []
    for f in range(total):
        a = int(f * step)
        b = int((f + 1) * step)
        seg = x[a:b]
        env.append(float(np.sqrt(np.mean(seg ** 2))) if len(seg) else 0.0)
    env = np.array(env)
    ref = np.percentile(env[env > 1e-4], 95)
    env = np.clip(env / ref, 0, 1) ** 0.75
    # light smoothing: fast attack, soft release
    smooth = []
    v = 0.0
    for e in env:
        v = e if e > v else v * 0.62 + e * 0.38
        smooth.append(v)
    return [int(round(v * 100)) for v in smooth]


def main():
    print('Alignment:')
    words = frames(align())
    duration = wave.open(VOICE).getnframes() / wave.open(VOICE).getframerate()
    total = int(math.ceil(duration * FPS))

    # Sections: each change falls on the first word of the section
    i_stakes = find(words, 'yet,') - 1  # "And yet,"
    i_r1 = find(words, 'First')
    i_r2 = find(words, 'Second')
    i_r3 = find(words, 'Third')
    i_r4 = find(words, 'Fourth')
    i_r5 = find(words, 'fifth') - 2  # "And the fifth"
    i_recap = find(words, 'It', find(words, 'multiplies.'))  # first "It" after "Claude multiplies."
    i_cta = find(words, 'Save')
    i_outro = find(words, 'next', i_cta) - 2  # "And the next time"
    bounds = [('hook', 0), ('stakes', words[i_stakes]['f']), ('r1', words[i_r1]['f']), ('r2', words[i_r2]['f']), ('r3', words[i_r3]['f']),
              ('r4', words[i_r4]['f']), ('r5', words[i_r5]['f']), ('recap', words[i_recap]['f']), ('cta', words[i_cta]['f']), ('outro', words[i_outro]['f'])]
    sections = {}
    for k, (name, f) in enumerate(bounds):
        sections[name] = {'from': f, 'to': bounds[k + 1][1] if k + 1 < len(bounds) else total}

    screen = display(words)
    main_pages = []
    for name, sec in sections.items():
        if name != 'hook':
            main_pages += pages(screen, sec['from'], sec['to'])
    data_pages = []
    for k, p in enumerate(main_pages):
        start = p[0]['f'] - 1
        end = main_pages[k + 1][0]['f'] - 1 if k + 1 < len(main_pages) else total
        end = min(end, p[-1]['g'] + 14)
        data_pages.append({'start': start, 'end': end, 'words': [{'t': m['t'], 'at': m['f']} for m in p]})

    # Big hook pages, laid out by hand (screen: top of the frame, above the monitor).
    # "This voice / is not me." "It's my / clone." (the script line is shown as animations) "I didn't touch / a thing." "Claude did / it all."
    def span(a, b):
        return [{'t': m['t'], 'at': m['f']} for m in screen[a:b]]
    h0 = 0
    h1 = find(screen, "It's")
    h2 = find(screen, 'The', h1)
    h3 = find(screen, 'I', h2)
    h4 = find(screen, 'Claude', h3)
    h5 = find(screen, 'And', h4)
    hook_pages = [
        {'start': screen[h0]['f'] - 1, 'end': screen[h1]['f'] - 1, 'lines': [span(h0, 2), span(2, h1)]},
        {'start': screen[h1]['f'] - 1, 'end': screen[h2]['f'] - 1, 'lines': [span(h1, h1 + 2), span(h1 + 2, h2)]},
        {'start': screen[h3]['f'] - 1, 'end': screen[h4]['f'] - 1, 'lines': [span(h3, h3 + 3), span(h3 + 3, h4)]},
        {'start': screen[h4]['f'] - 1, 'end': screen[h5]['f'] - 2, 'lines': [span(h4, h4 + 2), span(h4 + 2, h5)]},
    ]

    env = envelope(total)

    js = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
    words_ts = [{'t': m['t'], 'f': m['f'], 'g': m['g']} for m in words]
    with open(OUTPUT, 'w') as out:
        out.write('// Generated by scripts/build_reel.py: do not edit by hand.\n')
        out.write(f'export const FPS = {FPS};\nexport const TOTAL = {total};\n')
        out.write(f'export const SECTIONS = {js(sections)} as const;\n')
        out.write('export type SectionId = keyof typeof SECTIONS;\n')
        out.write(f'export const WORDS: {{t: string; f: number; g: number}}[] = {js(words_ts)};\n')
        out.write(f'export const PAGES: {{start: number; end: number; words: {{t: string; at: number}}[]}}[] = {js(data_pages)};\n')
        out.write(f'export const HOOK_PAGES: {{start: number; end: number; lines: {{t: string; at: number}}[][]}}[] = {js(hook_pages)};\n')
        out.write(f'export const ENV: number[] = {js(env)};\n')

    with open(CUES_FILE, 'w') as out:
        out.write('# Word-by-word cues (frames local to each section, 30 fps)\n\n')
        out.write('`const c = cues(\'r1\')` then `c(\'website\')` gives the local frame of the word; `c(\'computer\', 2)` the 2nd occurrence in the section.\n\n')
        for name, s in sections.items():
            out.write(f"## {name}: frames {s['from']} -> {s['to']} ({s['to'] - s['from']} frames, {(s['to'] - s['from']) / FPS:.1f} s)\n\n")
            line = [f"{m['t'].replace(NBSP, ' ')} +{m['f'] - s['from']}" for m in words if s['from'] <= m['f'] < s['to']]
            out.write(' · '.join(line) + '\n\n')

    print('total', total, 'frames', round(total / FPS, 2), 's')
    for name, s in sections.items():
        print(f"  {name:6} {s['from']:5} -> {s['to']:5}  {(s['to'] - s['from']) / FPS:5.1f} s")
    print('pages', len(data_pages))
    for p in data_pages:
        print('  ', ' '.join(w['t'] for w in p['words']).replace(NBSP, '~'))
    print('hook:')
    for p in hook_pages:
        print('  ', ' / '.join(' '.join(w['t'] for w in l) for l in p['lines']))


if __name__ == '__main__':
    main()
