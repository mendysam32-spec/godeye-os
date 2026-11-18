#!/usr/bin/env python3
# Fake voice to check the edit before paying for ElevenLabs: a near silent voice.wav and a scribe_words.json at about
# 3.4 words per second, with a pause after each sentence. Run it from the Remotion project (_reel/remotion).
# Usage: python3 <skill>/scripts/fake_words.py
import json
import math
import os
import re
import struct
import wave

cfg = json.load(open('reel.json'))
s = cfg['sections']
text = ' '.join([s['hook'], s['stakes'], *s['elements'], s['recap'], s['cta'], s['outro']])
t = 0.25
words = []
for b in text.split():
    if b in (':', '?', '!', ';'):
        continue
    d = 0.16 + len(b) * 0.016
    words.append({'text': b, 'start': round(t, 2), 'end': round(t + d, 2), 'type': 'word'})
    t += d + 0.02
    if re.search(r'[.?!…]$', b):
        t += 0.22
duration = t + 0.5
os.makedirs('../voice', exist_ok=True)
json.dump({'words': words}, open('../voice/scribe_words.json', 'w'), ensure_ascii=False)
w = wave.open('public/reel/voice.wav', 'wb')
w.setnchannels(1)
w.setsampwidth(2)
w.setframerate(48000)
# a small tone only while words are spoken, so the mascot's mouth envelope stays alive
n = int(duration * 48000)
amp = [0] * n
for m in words:
    a, b = int(m['start'] * 48000), int(m['end'] * 48000)
    for i in range(a, min(b, n)):
        amp[i] = int(1500 * math.sin(i / 48000 * 2 * math.pi * 180))
w.writeframes(struct.pack(f'<{n}h', *amp))
w.close()
print(f'{len(words)} words, {duration:.1f} s (fake voice: replace it before the final render)')
