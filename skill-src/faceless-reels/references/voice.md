# Voice and word timestamps

The voice is the user's cloned ElevenLabs voice: `elevenlabs_voice_id` and `elevenlabs_model` in `config.json`.

Two ways to call ElevenLabs:

- **Connector (Claude Code)**: the ElevenLabs connector tools (`creative_*`, deferred: load them with ToolSearch). Create a flow first (`creative_create_flow`) and reuse it for the whole reel. If the voice does not answer, check it with `creative_list_voices`.
- **HTTP API (any agent)**: with `ELEVENLABS_API_KEY` in the environment, never written in a file of the project and never shown on screen.

```bash
curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID?output_format=mp3_44100_128" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d @tts.json -o _reel/voice/take_1.mp3
```

`tts.json` holds `{"text": "...", "model_id": "<elevenlabs_model>"}`.

## Generate

- No speed setting: keep the natural pace of the voice (about 3.4 words/s on the French clone that validated this chain).
- Text with intention tags, one per block:

```text
[softly] This voice is not me. It's my clone.
[confident] The script, the animations, the editing: I didn't touch a thing.

[excited] First setting: the app on your computer. ...

[confident] It acts. It connects. ...

[excited] Subscribe to get the guide. ...
[softly] And the next time you hear my voice, remember...
```

- A word in capitals carries the stress (`real WORK`).
- Make 2 takes and compare. Measured cost: about 12 credits per spoken word for both takes (3,432 credits for 291 words). Announce the cost first.
- Download them to `_reel/voice/take_1.mp3` and `take_2.mp3`.

## Choose the take

Transcribe both locally, with timings, and compare them with the script (`<lang>` is the reel language, `<model>` is `whisper_model` from `config.json`):

```bash
ffmpeg -y -v error -i take_1.mp3 -ar 16000 -ac 1 t1.wav
whisper-cli -m <model> -l <lang> -f t1.wav
```

Keep the complete and most accurate take. The `-nt` mode skips sentences: do not trust it. Do not pass a prompt (`--prompt`) containing a product name: it distorts nearby words.

## Word timestamps

Connector: transcribe the chosen take with `creative_transcribe_audio`, model `eleven_scribe_v1`, passing the voice node in `connect_from`. Get the `words.json` file. Read the `source.url` of the result: it tells which take was transcribed.

HTTP API:

```bash
curl -s -X POST https://api.elevenlabs.io/v1/speech-to-text -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -F model_id=scribe_v1 -F timestamps_granularity=word -F file=@_reel/voice/take_1.mp3 -o words_raw.json
```

Either way, save the words as `_reel/voice/scribe_words.json` in the shape `{"words": [...]}`, after removing the bracket tags and the lone ":" tokens. Measured cost: about 1.6 credits per word (476 credits for 291 words).

A word written phonetically ("n-eight-n") often comes out of Scribe in another form: `build_reel.py` reports it as `replaced` and keeps its timings if the word count is the same. Otherwise it interpolates. Check these words in the output.

Scribe's text can differ from the script: that is fine, `build_reel.py` keeps Scribe's timings and the text of `reel.json`, and prints every difference. Read those lines: a `WARNING mismatch` line flags a sentence that the voice changed.

## Process without cutting

```bash
zsh <skill>/scripts/process_voice.sh ../voice/take_1.mp3 public/reel/voice.wav
```

High-pass, EQ, de-esser, gentle compressor, then two-pass linear loudnorm at -16 LUFS. The duration does not change by a single sample. It is the only processing allowed.

Then, from the project: `python3 scripts/build_reel.py`.

## Redo a sentence afterwards

To change the ending of a reel that is already validated, do not regenerate the whole text: keep the validated voice and replace only the ending.

1. Generate in one piece, in 2 takes, everything after the last section pause, even unchanged sentences, with the same tags. One single splice, and the tone stays continuous. Measured cost: 446 credits for the 2 takes of 38 words, 58 credits for the transcription.
2. Find the silence before the first word of the new part from the audio energy, never from Whisper's timings.
3. Cut the old take in that silence, place the new one so that its first sound lands on the same instant: the frames before it do not move.
4. Measure the same sentence on the old and the new take, and compensate the gap (0.7 dB on the "This voice" reel).
5. Process the assembled voice with `process_voice.sh`, run the new take through Scribe, shift its timings and append them to `scribe_words.json` after the old words. Merge what Scribe splits (a compound word cut in two) to get back the words of the script.
