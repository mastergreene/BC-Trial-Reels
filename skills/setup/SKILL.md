---
name: setup
description: Set up this Mac for the Trial Reels plugin. Installs and checks Homebrew packages (node, ffmpeg, whisper-cpp), downloads the Whisper speech model, installs the video template, then runs a short end-to-end test. Use when someone runs /setup, has just installed the plugin, or make-trial-reels reports something MISSING.
---

# Set up Trial Reels on this Mac

The plugin lives at `${CLAUDE_PLUGIN_ROOT}`. Go step by step, and tell the user in plain language what each step is for.

## 1. Check what's there

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs"
```

If `node` itself isn't found, Node.js is missing. Go to step 2 and come back.

Show the user the list, then fix only the MISSING items, in this order. WARN items (e.g. the headline font off macOS) have a fallback and can be left.

## 2. Install missing tools

- **Not a Mac:** macOS is the supported platform. On Linux, install `node` (20+), `ffmpeg` and whisper.cpp (`whisper-cli` on the PATH) with the system package manager instead of Homebrew, ask before installing, then carry on. Headlines use the bundled Inter Black fallback.
- **Homebrew missing:** the installer needs the user's Mac password, so the user has to run it themselves. Give them this to paste into Terminal, then wait until they say it's done:
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```
- **Node.js, ffmpeg or whisper-cli missing:** list exactly which packages you'll install and ask the user once. On a yes, run, including only the missing ones:
  ```bash
  brew install node ffmpeg whisper-cpp
  ```

## 3. Download the Whisper model

If the model is MISSING, ask before downloading. Tell them it's `ggml-large-v3-turbo.bin`, about 1.6GB, from Hugging Face (the official whisper.cpp model repo), saved to `~/.cache/trial-reels/`. On a yes:

```bash
mkdir -p ~/.cache/trial-reels && curl -L --fail -o ~/.cache/trial-reels/ggml-large-v3-turbo.bin.part https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin && mv ~/.cache/trial-reels/ggml-large-v3-turbo.bin.part ~/.cache/trial-reels/ggml-large-v3-turbo.bin
```

Run the download in the background; it takes a few minutes. If they already have this model file somewhere else (e.g. `~/.cache/vic-news-today/` from the Vic News Today plugin), they can skip the download: move or symlink it into `~/.cache/trial-reels/`, or set `TRIAL_REELS_WHISPER_MODEL` to its path in their shell profile.

## 4. Install the video template

```bash
cd "${CLAUDE_PLUGIN_ROOT}/remotion" && npm ci --no-audit --no-fund --loglevel=error
```

## 5. Test end to end

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" --test
```

This transcribes the bundled example clip and renders one frame of each vibe (Punchy, Raw, News). The first render downloads a headless Chrome for Remotion, so it takes a minute.

## 6. Report

- **Everything OK:** tell the user they're ready. Explain how to use it: give Claude a Dropbox link, a file name in Downloads, or a video path, and ask for trial reels (or run `/make-trial-reels`). Each approved clip is rendered three ways — Punchy, Raw and News — into `~/Downloads`, next to the source.
- **Anything failed:** say what failed and the fix from the check output. Don't claim setup worked.
