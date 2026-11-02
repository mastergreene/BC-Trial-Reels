# Trial Reels: multi-variant clip generator

A Claude Code plugin that turns a long video (a **Dropbox link**, a file in **Downloads**, or any local path) into 3–5 short vertical clips (20–40s), and renders **each clip three ways** so you can A/B/C test retention, visual language and pacing on the exact same moment.

It keeps the bold Navy `#151945` / Yellow `#fbed2a` / White look: high-contrast type, the highlighted headline card and its pop-and-drop physics. There is no location badge on the card. You can add your own image per clip if you want one.

## The three vibes

| | **Punchy** (social native) | **Raw** (organic feed) | **News** (broadcast) |
|---|---|---|---|
| **Pacing** | Dead air trimmed out: jump cuts snapped to the audio envelope | Natural breath and pauses, no jump cuts | Measured, with room for points to land |
| **Framing** | Alternates 1.0x wide / 1.15x close every 3–5s, on cuts or emphasis words (numbers) | Static, centred 1.0x | One continuous slow push, 1.0x → 1.08x |
| **Captions** | Kinetic word-by-word, yellow pill on the active word, at eye level | Subtle white lower-third subtitles, soft shadow | Balanced two-line blocks on navy |
| **Graphics** | Title card for 2.5s, then pops and drops off with motion blur | None | Title card, then a persistent lower-third strap |
| **For** | TikTok / Reels feeds | Getting past the "this is an ad" reflex | Facebook, LinkedIn, community trust |

Output, saved next to the source in `~/Downloads`:

```
Founder interview - Clip 1 [Punchy].mp4
Founder interview - Clip 1 [Raw].mp4
Founder interview - Clip 1 [News].mp4
Founder interview - Clip 2 [Punchy].mp4
…
```

---

## Installation (about 15 minutes, once per Mac)

1. **Claude Code:** install the Claude desktop app (https://claude.ai/download) and open the **Code** tab, or the Claude Code CLI (https://claude.com/claude-code).
2. **Homebrew** (if `brew --version` says "command not found"):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
3. **GitHub sign-in** (only if this repo is private):
   ```bash
   brew install gh
   ```
   ```bash
   gh auth login
   ```
4. **Add and install the plugin** in Claude Code:
   ```
   /plugin marketplace add mastergreene/BC-Trial-Reels
   ```
   ```
   /plugin install trial-reels@trial-reels
   ```
5. **Run setup** in Claude Code:
   ```
   /setup
   ```
   It installs `node`, `ffmpeg` and `whisper-cpp` via Homebrew, downloads the Whisper model (~1.6GB, ask-first), installs the video template, and test-renders a frame of each vibe. When it says **"All good — ready to cut trial reels"**, you're set.

macOS is the supported platform. On Linux, install Node 20+, ffmpeg and whisper.cpp yourself. Headlines then use the bundled Inter Black instead of Helvetica Neue Condensed Black.

---

## Using it

Tell Claude where the video is:

> Make trial reels from this: https://www.dropbox.com/scl/fi/…/interview.mp4?rlkey=…

> Cut the founder interview in my downloads into trial reels

Or run `/make-trial-reels`.

Claude then:
1. Downloads the video (for Dropbox links) and **transcribes** it with whisper.cpp.
2. Identifies speakers and picks the top clip candidates (hooks, strong claims, standalone moments), with proposed headlines.
3. **Stops and asks you to confirm** each clip and its on-screen text. Nothing renders until you approve.
4. **Batch-renders the three vibes** for every approved clip, then strips tool metadata from each file.

**Changes:** e.g. "make clip 2's headline shorter" or "end clip 3 a sentence earlier". Claude re-renders just that clip, or just one vibe of it.

### Running the scripts directly

```bash
node scripts/check.mjs                                   # dependencies (add --test for an end-to-end check)
node scripts/fetch.mjs "<dropbox link>"                  # download into ~/Downloads
node scripts/transcribe.mjs "<video>" --names "Jane Smith"
node scripts/frames.mjs "<video>" 65 412                 # frames with a cropX grid
node scripts/render.mjs "<video>" --preview              # stills per clip and vibe
node scripts/render.mjs "<video>"                        # all approved clips × 3 vibes
node scripts/render.mjs "<video>" --vibe punchy          # punchy | raw | news | all | punchy,news
node scripts/render.mjs "<video>" --only 2 --out ~/Desktop
```

`clips.json` lives in the run's working folder (`~/.cache/trial-reels/runs/<name>-<hash>/`). See `skills/make-trial-reels/SKILL.md` for its format and per-vibe overrides.

**Environment variables:** `TRIAL_REELS_OUTPUT_DIR` (default `~/Downloads`), `TRIAL_REELS_WHISPER_MODEL` (path to an existing `ggml-large-v3-turbo.bin`), `TRIAL_REELS_BROWSER` (a specific Chrome/Chromium for Remotion).

**Clean files:** the last step on every reel strips the "Made with Remotion" tag, the encoder tags and the x264 settings in the video stream. Nothing is re-encoded, so there's no quality loss.

---

## What's inside

```
skills/setup/                      /setup: install + test
skills/make-trial-reels/           the workflow skill
  references/clip-rules.md         clip selection + card-text rules
scripts/
  lib.mjs                          paths, the three vibe profiles, caption re-timing
  edges.mjs                        audio-envelope pause detection (edge snapping, silence trimming)
  render.mjs                       cut → per-vibe props → Remotion render → metadata strip
  fetch / transcribe / frames / check
remotion/src/TrialReel/
  TrialReel.tsx                    composition; `vibe` prop picks the defaults
  TitleCard.tsx                    cardMode: pop_exit | persistent (card → strap) | none; optional badgeSrc
  Captions.tsx                     captionStyle: kinetic | subtle | block
  Shot.tsx                         crop, zoom / slow push, per-edge audio fades
  theme.ts, fonts.ts               palette, layout, font fallbacks
```

Open Remotion Studio (`cd remotion && npm run dev`) to preview the three vibes on the bundled example clip (`TrialReel`, `Example-Raw`, `Example-News`).

## Notes

- **Remotion licence:** free for teams of up to 3 people. More than that needs a company licence: https://www.remotion.dev/license
- **Fonts:** headline in Helvetica Neue Condensed Black (macOS), falling back to Inter Black, then Arial Black. Label in Archivo Black, kinetic and block captions in Inter, subtle captions in Noto Sans.
- **Example clip:** `remotion/public/example.mp4` is a short press-conference excerpt used only by the Studio previews and `check.mjs --test`. Swap in your own footage if you prefer (keep a clear line of speech in the first 10s for the transcription test, and update the phrase it checks for in `check.mjs`).
