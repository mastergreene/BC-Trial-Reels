---
name: make-trial-reels
description: Turn a long video (Dropbox link, a file in ~/Downloads, or any local path) into 3–5 short vertical clips, each rendered in three edit vibes — Punchy (silence-trimmed, punch-ins, kinetic captions), Raw (static, no graphics, subtle subtitles) and News (slow push, title card into lower-third strap, block captions) — for A/B/C testing retention and pacing. Transcribes with whisper.cpp, proposes clips and headlines, and asks the user to confirm before rendering. Use when someone gives a video or link and asks for trial reels, test variants, A/B/C cuts, or clips in different styles.
---

# Make trial reels (3 vibes per clip)

The plugin lives at `${CLAUDE_PLUGIN_ROOT}`; scripts are in `${CLAUDE_PLUGIN_ROOT}/scripts`.
- **Output:** finished reels go into `~/Downloads` (or `TRIAL_REELS_OUTPUT_DIR`, or `--out <dir>`), named after the source:
  ```
  <title> - Clip <n> [Punchy].mp4
  <title> - Clip <n> [Raw].mp4
  <title> - Clip <n> [News].mp4
  ```
- **Working files:** the transcript, `clips.json`, frames and previews go to a hidden per-video folder under `~/.cache/trial-reels/runs/`. `transcribe.mjs` prints its path.
- **Script input:** every script takes the **video** (its path, or just its file name if it's in `~/Downloads`).

Keep the user posted with one short line per stage.

Before starting, read `references/clip-rules.md`.

## The three vibes

All three use the **same source sections** of each clip, so the test isolates the edit:

| Vibe | Pacing | Framing | Captions | Graphics |
|---|---|---|---|---|
| **Punchy** | Dead air trimmed out (jump cuts snapped to the audio envelope) | Alternates 1.0x wide / 1.15x close every 3–5s, preferring cuts and emphasis words (numbers) | Kinetic, word-by-word, yellow pill on the active word, at eye level | Title card for the first 2.5s, then pops and drops off with motion blur |
| **Raw** | Natural pauses kept, no jump cuts | Static 1.0x | Subtle white lower-third subtitles, soft shadow | None |
| **News** | Measured, extra breathing room at the edges | One continuous slow push, 1.0x → 1.08x | Balanced two-line blocks | Title card, then a persistent lower-third strap |

## 0. Check the machine

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs"
```

If anything shows MISSING, stop and tell the user to run `/setup` first. WARN lines are fine.

## 1. Get the video

- **A Dropbox link** (`https://www.dropbox.com/…`). The link is the request to download it:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/fetch.mjs" "<dropbox link>"
  ```
  It prints the saved path; use that video from here on. If it says the link needs a sign-in or is a folder link, pass that on and stop.
- **A file in Downloads**, by name or description. Find it with:
  ```bash
  ls -lt ~/Downloads | grep -iE '\.(mp4|mov|m4v|mkv|mxf|webm)$' | head -20
  ```
  If more than one could match, ask which. Don't pick for them.
- **Any other path**, e.g. dragged into the chat.

If nothing was given, ask. Check that `ffprobe` can read the file.

## 2. Transcribe

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/transcribe.mjs" "<video>" --names "<people, brands, places likely to be said>"
```

`--names` is optional but helps Whisper spell proper nouns. It prints the **working folder** and writes `meta.json`, `transcript.json` (words) and `transcript.txt` (sentences with `[start–end]` seconds). A 20-minute video takes about a minute; run it in the background for long ones.

## 3. Read and identify speakers

- Read all of `transcript.txt`. Blank lines mark pauses over 1.5s: often a speaker change or a question.
- Grab frames where the speaker may change, and at the start, middle and end of each candidate:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/frames.mjs" "<video>" 65 412 980   # → <working folder>/frames/
  ```
  The yellow lines mark cropX 0.1 to 0.9, and the thick red line is 0.5. Note who is speaking and the cropX under their face.
- If a speaker's name is never said and matters for the headline, ask the user rather than guessing.
- Fix misheard words in `transcript.json` (names, numbers, amounts), because captions are built from it. Edit only `text`, never the timings.

## 4. Pick clips → `clips.json` (in the working folder)

Follow `references/clip-rules.md`. Timing:
- **Start** about 0.1s before the first word's `startMs`; **end** just after the last word, before the next word's `startMs`.
- These only need to be close. `render.mjs` snaps each edge into the real pause in the audio, per vibe (tight for Punchy, more breath for Raw and News), and prints every adjustment. If it prints `! no pause found…`, that edge was left as written: check it in the finished reel. `"snap": false` on a section keeps its times exactly.
- **`cardExitSec`** (reel time) is when the **News** card turns into the strap: the end of a phrase, about 4–7s in, after the headline's point has been said. Punchy always drops its card at 2.5s.
- No `zoom` needed: each vibe sets its own framing. Just give each section's `cropX`.

```json
{
  "title": "Founder interview",
  "clips": [
    {
      "id": 1,
      "label": "WATCH",
      "headline": "We doubled sales\nin under a year\nwith zero ads",
      "highlight": "doubled sales",
      "cardExitSec": 5.2,
      "speakers": ["Jane Smith"],
      "why": "Strong claim with a number in the first sentence; complete story in 30s.",
      "shots": [
        { "startSec": 812.4, "endSec": 829.3, "cropX": 0.46 },
        { "startSec": 1040.1, "endSec": 1052.9, "cropX": 0.62 }
      ]
    }
  ]
}
```

Optional per clip:
- `"vibes": { "punchy": { "cardExitSec": 3 }, "news": { "cardMode": "pop_exit", "captionStyle": "subtle" } }` overrides one vibe's card timing, card mode (`pop_exit` | `persistent` | `none`) or caption style (`kinetic` | `subtle` | `block`). Use only when the user asks; the defaults are the test.
- `"badgeSrc": "brand/logo.png"` perches an image on top of the card (file in `remotion/public/`). None by default.

## 5. Confirm with the user. Stop here until they approve.

**Don't render anything, not even `--preview`, until the user has approved the clips and the on-screen text.**

1. **Short chat summary.** One line per pick: headline, speaker, length and why it works. Then one line on what you left out and why. Remind them each approved clip renders as **3 variants** (Punchy, Raw, News).
2. **Ask with the `AskUserQuestion` tool**, one question per clip (up to 4 per call; with 5 clips, ask 1–4 then 5).
   - `header`: `Clip <n>`
   - `question`: `Clip <n> (<speaker>, <length>s): render all three vibes with this text?`
   - Options:
     1. **Render as is**, with a `preview`:
        ```
        WATCH
        WE [DOUBLED SALES]
        IN UNDER A YEAR
        WITH ZERO ADS

        News card → strap at 5.2s · Punchy card off at 2.5s · Raw: no text
        Source 13:32–13:49 + 17:20–17:33 (2 sections)

        "We doubled sales in under a year, and we didn't spend a cent on ads…"
        ```
        Label, then the headline in capitals line by line with `[ ]` around the highlight, then the card timings, source times and the opening of what's said.
     2. **Change the text**: "I'll tell you what to change (headline, label or highlight)".
     3. **Drop this clip**.

   "Other" lets them type an instruction for that clip, e.g. "end it a sentence earlier" or "only render Punchy and Raw".
3. **Apply the answers.** Edit `clips.json`, keeping the rules in `clip-rules.md`; if a change breaks one (e.g. highlight not in the headline), say so and suggest a fix. Dropped clips are removed and the remaining `id`s renumbered from 1. If they only want some vibes, note it and pass `--vibe` when rendering.
4. **Re-confirm only the clips that changed**, until every clip is approved or dropped.
5. **If every clip is dropped,** ask whether they want different picks.

If `AskUserQuestion` isn't available, put the same details in a chat message, ask for approvals or changes, and **end your turn**.

## 6. Preview, then render

Only the approved clips. Don't change approved text while previewing without asking; crop and timing fixes don't need re-approval.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" "<video>" --preview   # stills in <working folder>/preview/
```

The first run installs the template's packages (~1 minute). Stills are named `clip-<n>-<vibe>-still-<k>.jpg`. Check:
- **Punchy:** card on screen at the start; a 1.15x close-up still keeps the face in frame; kinetic captions don't cover the eyes.
- **Raw:** no card or graphics at all; subtitles readable.
- **News:** card at the start, strap after `cardExitSec`; the strap headline reads on one or two lines.
- In all three, the speaker's face is centred and the captions are correct.

Fix `clips.json` and re-preview as needed (`--only <id>` for one clip, `--vibe <vibe>` for one vibe). Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" "<video>"                 # all clips × all three vibes
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" "<video>" --vibe punchy   # or one vibe (punchy | raw | news | all | a,b)
```

`render.mjs` prints, per vibe, the length, number of shots and (for Punchy) how much dead air was trimmed. Each 30s variant takes about a minute from 4K, so a 4-clip run is ~12 minutes; run it in the background. As its last step it strips tool metadata from every file (the "Made with Remotion" comment, encoder tags, and the x264 settings in the video stream) without re-encoding.

Then check:
- **Crop throughout:** `preview/clip-<n>-<vibe>.jpg` in the working folder is one frame per second.
- **Clean edges and cuts:** transcribe the first and last 3 seconds of each finished reel with `whisper-cli`. For Punchy, also spot-check a few jump cuts for clipped words. If something's off, adjust that clip and re-render with `--only <id> --vibe <vibe>`.

## 7. Hand over

The plugin doesn't post anywhere. Tell the user where the reels are and list them grouped by clip: file name, length, speaker and headline, with one line per clip on what differs (e.g. "Punchy is 26s after trimming vs 30s for Raw/News"). Suggest they post the three variants of a clip on comparable slots and compare retention (average watch time, 3-second hold) rather than views alone.

## Re-cuts

Edit that clip in `clips.json` and re-render with `--only <id>` (and `--vibe` if only one variant changes). This works as long as the source video is still at the same path.
