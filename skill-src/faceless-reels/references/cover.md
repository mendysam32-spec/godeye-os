# The cover

It is mandatory and always made the same way. It is used twice: first frame of the video, and a separate file for YouTube and Instagram.

## The background

The image `cover.png` in the video folder, else `assets/cover/cover-template.png`: a window with a white zone at the top, the creator's photo on a violet background at the bottom, 1080 x 1620. It is the only place where a face appears. The photo is not retouched.

The skill ships a neutral template with a placeholder instead of a photo. To make your own, open `assets/cover/cover-template.png` in any image editor, put your photo in the placeholder area, keep the top zone and its dotted pattern untouched, and save it as `cover.png` (1080 x 1620) in the video folder, or replace the template once for all your reels. If you change the layout, adjust the constants at the top of `scripts/prep_cover.py`.

`scripts/prep_cover.py` prepares two backgrounds. For 9:16, the white zone is enlarged by repeating a 43 px slice, the period of the dot pattern: the photo is neither stretched nor cropped, and the title moves down into the zone kept by the 3:4 and 4:5 profile crops.

## The title

It must make people want to click, that is its only job. It does not summarize the video, it promises what you gain from it.

Reference concept: "5 FREE CHINESE AIs". A number, the topic, a strong word on an inverted block. Since the background is light, we invert: black text, black vertical bar on the left, last line in white on a black block.

Shapes that work:

- number + topic + benefit: "3 SETTINGS AND CLAUDE WORKS FOR YOU";
- number + topic + strong word: "3 AGENTS THAT RUN ALONE".

Rules:

- 3 or 4 lines, inverted block included, 6 to 8 words. Aim for 11 characters per line, 14 at most: the font size is computed on the longest line, and a massive title reads better on the profile grid.
- In capitals, with accents in languages that have them. A brand keeps its spelling: n8n stays lowercase.
- The inverted block carries the benefit, in 1 to 3 words.
- Everything must be true: the reel keeps the promise of the title, with no invented number and no unsourced superlative. Avoid "hidden", "secret" or "nobody knows" if they are false.
- The title differs from the first sentence of the voice: it adds a reason to click, it does not double the hook.

In `reel.json`: `cover.lines` (black lines) and `cover.block` (inverted line). The size is computed from the longest line.

## The logos

One or two, around the head, as tilted app tiles, never on the face. Put the main tool of the reel in the first spot (the one the photo points at, if it does). `cover.logos` lists file names from `public/reel/logos/` (square PNG, without the extension in the list). The skill ships no brand logo: add the ones you need.

Only use real logos, never redrawn from memory. In order of preference: the icon of the installed app, a logo provided by the user in the project folder, the brand's official press kit (download only with the user's agreement). Without a reliable logo, leave `cover.logos` empty and say so at delivery: a cover without a logo is better than a fake logo.

On macOS, from an installed app:

```bash
sips -s format png -Z 1024 /Applications/App.app/Contents/Resources/*.icns --out public/reel/logos/app.png
```

Crop it without its shadow. If the logo alone reads badly at small size, write the name under it.

## Placing it in the video

`render_final.sh` does everything: the cover becomes a one-frame segment, rendered with the same options as the reel, so the same H.264 headers. The assembly puts this segment in front, with 1,600 samples of silence, without re-encoding the reel. The video gains 1 frame, the sound stays in sync.

Exports: `<id>.mp4`, `<id>-cover.jpg` (9:16, for Instagram, YouTube Shorts and TikTok), `<id>-cover-2x3.jpg` (original format).

Since the reel loops, the cover shows up again for 33 ms on every loop. This is intended: mention it at delivery so the user checks it on a phone.

## Check

Look at the whole final image: no cut line, nothing in the right-hand bar, logos far from the face and the hand. Then shrink it to 200 px wide: the title must still be readable.
