# Analyze a reference and write the script

## Analyze a reference reel

1. Extract the audio: `ffmpeg -i ref.mp4 -vn -c:a libmp3lame -q:a 2 _reel/reference/reel_audio.mp3`.
2. Transcribe it with Scribe (see `voice.md`), or locally with whisper-cli for free. Keep the text and the timings.
3. Make contact sheets: `python3 <skill>/scripts/contact_sheet.py ref.mp4 sheet.jpg 0 <duration> 1 8 270`, and look at all of them.
4. Measure: spoken duration, words per second, music or not, hard cuts or not, rhythm of the changes on screen.
5. Write `reel_analysis.md`: measurements, timed plan (time, role, what is said, what is shown), formula of one element, visual grammar, retention levers, what we keep and what we change. Model: `assets/example-this-voice/reel_analysis.md`.

We take the architecture, never the text, the visuals or the mascot of another creator.

## Script plan

Target duration: 60 to 120 s. Pace of the cloned voice measured in French: 3.4 words/s, so 200 to 400 words; measure your own voice on a first take. The validated reel has 291 words and lasts 86 s.

| Part | Share | Role |
|---|---|---|
| `hook` | 8 % | Proof or promise + constraint, in under 8 s |
| `stakes` | 10 % | The same tool, two results. Flip the blame (it is not the tool, it is the setup). Announce N elements: the open loop |
| `elements` | 62 % | N elements, usually 3 to 5 |
| `recap` | 8 % | One word per element, in a burst, then a punchline |
| `cta` | 7 % | Subscribe, link in bio, keyword: the required sentence is enough |
| `outro` | 5 % | An open sentence that leads back to the first one |

These shares are landmarks, not rules.

## The hook

Two shapes that work:

- **The lived proof**: show that what you are watching is itself the result. "This voice is not me. It's my clone."
- **The promise with a constraint**: "If I had to set up Claude in a single day..."

Prefer the proof when the topic allows it. It is rarer, and it can be checked live. The first sentence lasts under 3 s and reads without sound.

If no lived proof is available, do not invent one: use the promise, or a counter-intuitive statement ("Your workflow works. And that's the trap."), and tell the user which proof from them would make the reel stronger.

## The formula of one element

1. **Name**: ordinal + short name. "Second setting: connectors."
2. **Definition** in one simple sentence, without jargon, for a curious beginner.
3. **Concrete benefit**: an example or a list of 3 or 4 cases.
4. **Proof** taken from the reel itself when possible. "I connected it to ElevenLabs."
5. **Punchline**: a very short sentence that closes the idea. "All by itself."

For a list of mistakes, myths or traps, the shape becomes: name, what people do wrong, concrete consequence, the fix, punchline.

Order of the elements: the easiest first, a quick win, then one notch higher each time. The last one is announced by a re-hook ("And the fifth one is where it gets crazy"), right when attention drops.

Give each element a verb: it acts, it connects, it learns, it remembers, it multiplies. These verbs feed the headers and the recap, and the recap is what stays in mind.

## The call to action

Required shape, in this order, in the reel language (the wording lives in `config.json`, key `cta`):

> Subscribe to get the guide, then click the link in bio, and type the keyword XXXX.

This ending is mandatory in every reel and Short, without exception: subscribe, link in bio, keyword. The user has their guides page in their bio: never say "link in the description". A short sentence can come before, like "Save this video, you're going to need it". Nothing after the required sentence, except the open sentence that loops.

- **The keyword** is one short word, unambiguous when spoken, directly related to the guide and the topic. Reel about 5 settings: SETTINGS. It must be pronounced clearly: check that Scribe does not mishear it.
- **The guide** must exist or be planned. The script does not promise it silently: flag it to the user at delivery, with the title of the guide and its proposed content (usually the N elements in detail).
- The guide text on the final screen comes from `reel.json`, part `guide`. `guide.link` is `LINK IN BIO`.
- Write the keyword in capitals in the text sent to ElevenLabs: it carries the stress of the sentence.

## The ending that loops

The last sentence stays open and leads to the first one: "And the next time you hear my voice, remember..." then "This voice is not me". Write both together.

## Writing for the voice

- Sentences of 4 to 12 words. One idea per sentence.
- Speak to one person, spoken language, no word the audience would not say.
- Write names the way they are pronounced, as one word if Scribe must see them as one word: "Eleven Labs", "n-eight-n". `sections` holds that text, the exact text of the voice, and `display` gives the spelling on screen (`{"n-eight-n": "n8n"}`). Listen to these words on the take.
- Write numbers as words: "five settings". The screen shows 5.
- No forced emotion: the strength comes from the proof.

## Truth of the claims

End `script.md` with the list of what must stay true for this video, as in the example. A sentence that cannot be made true is rewritten. If the script says agents built the scenes, they must really build them.
