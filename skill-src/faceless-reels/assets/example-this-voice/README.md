# Example: the reel "This voice is not me"

A quality reference, not a template to copy as is. The reel was originally produced in French; the script and scenes here are an English adaptation. These scenes predate the generic template:

| In the example | In the template |
|---|---|
| `Setting1.tsx`, `r1Sfx`, section `r1` | `Element1.tsx`, `e1Sfx`, section `e1` |
| `Hook.tsx`, `Stakes.tsx`, section `stakes` | `Hook.tsx`, `Stakes.tsx`, section `stakes` (driven by `reel.json`) |
| `Cta.tsx`: save, then the gestures of `CtaGuide.tsx` | `CtaGuide.tsx`: subscribe, link in bio, keyword |
| `Recap.tsx` written for 5 verbs | `Recap.tsx` driven by `reel.json` |
| `build_reel.py`, `Reel.tsx` with the text hard-coded | Text in `reel.json`, `Reel.tsx` unchanged from one reel to the next |

Its ending was redone afterwards with the keyword rule: subscribe, link in bio, SETTINGS. For a new reel, `references/script.md` is the source of truth.

Import from `../theme` and `../kit` as in the template.
