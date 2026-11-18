# Opening shot with Atlas Cloud

A short cinematic video that gives the reel its identity and stops the thumb. Optional: without it (`"hook": {"video": false}`), the reel opens on the still image of the studio.

Cost measured on the validated reel: $1.46 for 4 images and 8 s of Kling 3.0 Pro. Announce the cost, and check the balance with `atlas_get_balance` before and after. In Claude Code the tools are `mcp__atlascloud__*` (load them with ToolSearch). On another agent, use the Atlas Cloud MCP server or its HTTP API with the same model ids. Check `atlas_get_model_info` if a model refuses a parameter.

## Principle

A static, straight-on shot of a dark studio with a vertical screen. Something comes out of the screen to illustrate the hook, stays in frame while the voice speaks, then goes back into the screen. The camera then dives into the screen, and the whole rest of the reel happens inside it. At the end, the camera comes back out of the same screen: that is what makes one single shot and the loop.

Adapt what comes out of the screen to the topic of the reel. For the cloned voice, it was a particle silhouette sitting at the microphone.

## The studio

`public/reel/empty_studio.jpg` is provided: reuse this studio for the reels of a same series, it costs nothing and the coordinates of its screen are already measured (`MON` in `Reel.tsx`). For another set, keep the same constraint: a vertical, flat screen facing the camera, on which the canvas lands, and measure `MON` again.

Studio prompt (`openai/gpt-image-2/text-to-image`, `size: 1152x2048`, `quality: high`, `output_format: png`). `gpt-image-2` gave a better result than `google/nano-banana-2/text-to-image`:

```text
Cinematic film still, vertical 9:16 composition, perfectly straight-on frontal view with symmetrical one-point perspective, camera locked at chest height. A dark, empty home recording studio at night. In the center of the frame, on a black desk against a dark acoustic-panel wall, one large computer monitor mounted in PORTRAIT orientation: a tall vertical 9:16 screen, flat and facing the camera exactly, thin black bezel. The screen is on and shows a plain uniform very dark navy blue glow with absolutely nothing on it: no text, no interface, no logo. On the left side of the desk, a professional broadcast microphone on a black boom arm with a round pop filter, aimed at the empty space where a person would sit. In the lower center foreground, seen from behind, an empty black ergonomic office chair. Nobody in the room. Soft teal-mint rim light coming from the screen on the edges of the microphone, the chair and the desk, faint violet light in the far corners of the room, thin volumetric haze, tiny dust particles floating. Deep blacks, moody, premium, shallow depth of field, 35mm lens, ultra realistic photograph. No people, no text, no logos, no watermark.
```

## The end image

With `openai/gpt-image-2/edit`, passing the URL of the start image in `images`, `size: 1152x2048`. The prompt always starts by locking the image, then asks for one addition only:

```text
Keep this photograph strictly identical: same room, same framing, same camera position, same monitor, same plain dark navy screen, same microphone, same desk, same chair, same dark moody lighting. Make only one addition: [what appears]. No text, no logos.
```

For a faceless topic, keep a figure without features: a particle silhouette seen from behind, an object, a hologram.

## The video

`kwaivgi/kling-v3.0-pro/image-to-video`, with `image`, `end_image`, `duration: 8`, `sound: false`. The prompt forbids any camera movement, otherwise the screen moves and the dive no longer lands right:

```text
Locked-off static tripod shot, absolutely no camera movement, no zoom, no pan. [The set]. [What happens, stating what happens during the first 3 seconds]. The room, the monitor, the microphone and the chair stay perfectly still. Cinematic, smooth, realistic light falloff, dark moody atmosphere. No text.
```

Save it in `_reel/hook/`. Look at a contact sheet before going further.

## Retiming on the voice

Kling gives 8 s, the voice needs something else. The voice is never touched: the image is retimed.

```bash
python3 <skill>/scripts/retime_hook.py ../hook/kling.mp4 public/reel/hook.mp4 --hook-end <first frame of stakes> --shape 105
```

`--hook-end` is read in the output of `build_reel.py`. `--shape` is the frame where the shape must be complete: set it on the strong word of the hook, using `CUES.md`. The script does: calm for 1 s, fast build-up, slow back and forth over the last seconds while the voice speaks, reverse playback so everything goes back into the screen during the dive. Then set `"hook": {"video": true}`.

The first frame of `hook.mp4` must look like `empty_studio.jpg`: that is the frame the end of the reel comes back to. If the studio was regenerated, replace `empty_studio.jpg` with the start image cropped to 1080 x 1920.

## The mascot

`public/reel/mascot.png` is provided, and it stays the same from one reel to the next: it is a landmark for the audience. Its face is drawn in SVG in `kit.tsx`, and its mouth follows the voice. To use your own mascot, replace `mascot.png` with a character of the same size and framing, then check the face position in a still.
