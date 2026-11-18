# Check and deliver

Announce nothing without measuring it on the final file, not on an intermediate one.

## Automatic check

```bash
python3 <skill>/scripts/check_reel.py ../exports/<id>.mp4 public/reel/voice.wav ../render/cover.png
python3 <skill>/scripts/scan_flicker.py ../exports/<id>.mp4 --skip-band 1120:1440
```

`check_reel.py` measures: format, frames, loudness, true peak, voice not cut (constant offset over the whole duration), gap between the voice and the rest, first frame equal to the cover, loop.

Targets:

- 1080 x 1920, 30 fps, H.264 yuv420p tv, AAC 48 kHz.
- -14 LUFS +/- 0.3, peak <= -1 dBTP.
- Voice: constant offset (delta <= 2 ms), correlation >= 0.95.
- Voice on average at least 12 dB above the rest (median gap over 0.5 s slices). The script lists the tightest passages: harmless on a pause between two sentences, to fix if a word falls on it. The validated reel gives 17 dB, and its tightest passage (83.5 s) is the pause between two sentences.
- First frame close to the cover (PSNR >= 33 dB); 2nd and last frames close to each other (PSNR >= 35 dB).

`scan_flicker.py` flags series to look at frame by frame. Boxes appearing every 3 frames are normal, a blinking element is not: fix it with `patch_frames.sh`.

## Text of the mix

```bash
ffmpeg -y -v error -i ../exports/<id>.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le final16k.wav
whisper-cli -m <whisper_model> -l <lang> -f final16k.wav
```

Read the **whole** text and compare it with the script. No prompt, no `-nt`, no truncated output. Whisper can get a word wrong: listen to that passage again with an excerpt, on the voice alone and on the mix.

## Frames

A contact sheet of about 30 frames of the final file with `contact_sheet.py`, plus the 1st, 2nd and last frames. Look at everything.

## exports/instagram.md

- Caption ready to paste: strong first sentence, the N elements, then the required ending, on two lines: what the guide contains, then "To get it: subscribe, go to the link in bio and type the keyword XXXX." No link, on any network: they are not clickable. Model: `assets/example-this-voice/instagram.md`.
- 5 hashtags at most, on every network, and the same number everywhere: Instagram refuses more.
- 3 titles for YouTube Shorts or TikTok.
- The cover files and their use.
- Points to check before publishing: the guide exists, the keyword opens that guide, the bio link leads to the guides page.

## Delivery

Send the `.mp4` and the cover to the user (in Claude Code, with SendUserFile). Say: what was done, what was measured, what was not (human listening, playback in Instagram on a real phone), the real cost (ElevenLabs credits, Atlas balance before and after), and the decisions taken on the user's behalf. Update `_reel/README.md`. Delete the bundle and the intermediate images, keep `render/`.

## Publishing

Only if the user asks, or in autonomous mode. For YouTube, Instagram, TikTok and Facebook, Blotato works well (`blotato_list_accounts`, then `blotato_create_post` with the video uploaded through `blotato_create_presigned_upload_url`). Use the same caption on Instagram, TikTok and Facebook, the cover as thumbnail, and declare the AI-generated content on TikTok and YouTube.
