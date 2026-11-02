#!/usr/bin/env node
// Check everything Trial Reels needs on this machine.
//
//   node scripts/check.mjs          quick dependency check
//   node scripts/check.mjs --test   also transcribe + render a frame of each vibe from the bundled example
//
// Prints one line per item (OK / WARN / MISSING) and exits non-zero if anything required is missing.
// WARN items are recommended but have a fallback (e.g. the headline font).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MODEL_PATH, OUTPUT_DIR, REMOTION_DIR, ensureRemotionDeps } from "./lib.mjs";

const results = [];
const record = (name, ok, detail, fix, { optional = false } = {}) => {
  results.push({ name, ok, optional });
  const tag = ok ? "OK     " : optional ? "WARN   " : "MISSING";
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ""}${!ok && fix ? `\n         fix: ${fix}` : ""}`);
};
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts }).toString().trim();
const has = (cmd) => {
  try {
    return run("/bin/sh", ["-c", `command -v ${cmd}`]);
  } catch {
    return "";
  }
};
const isMac = process.platform === "darwin";

record("macOS", isMac, os.release(), "macOS is the supported platform; elsewhere, install the tools below yourself.", { optional: true });

if (isMac) {
  const brew = has("brew");
  record("Homebrew", !!brew, brew, "Install from https://brew.sh (needs your Mac password).", { optional: true });
}

const [major] = process.versions.node.split(".").map(Number);
record("Node.js 20+", major >= 20, process.versions.node, "brew install node");

const ffmpeg = has("ffmpeg");
record("ffmpeg", !!ffmpeg, ffmpeg, "brew install ffmpeg");

const whisper = has("whisper-cli");
record("whisper-cli (whisper.cpp)", !!whisper, whisper, "brew install whisper-cpp");

const modelOk = fs.existsSync(MODEL_PATH) && fs.statSync(MODEL_PATH).size > 1_000_000_000;
record(
  "Whisper model (large-v3-turbo, ~1.6GB)",
  modelOk,
  modelOk ? MODEL_PATH : `not at ${MODEL_PATH}`,
  "Download it — /setup does this after asking.",
);

const fontOk = isMac && fs.existsSync("/System/Library/Fonts/HelveticaNeue.ttc");
record(
  "Headline font (Helvetica Neue Condensed Black)",
  fontOk,
  fontOk ? "macOS system font" : "not found — headlines fall back to Inter Black",
  "Comes with macOS. Optional: the bundled fallback still renders.",
  { optional: true },
);

// The test needs the template packages, so install them first rather than report them missing.
if (process.argv.includes("--test")) ensureRemotionDeps();
const depsOk = fs.existsSync(path.join(REMOTION_DIR, "node_modules", "remotion"));
record("Template packages (npm)", depsOk, depsOk ? REMOTION_DIR : "not installed", `cd "${REMOTION_DIR}" && npm ci`);

let outOk = false;
try {
  fs.accessSync(OUTPUT_DIR, fs.constants.W_OK);
  outOk = true;
} catch {}
record("Output folder writable", outOk, OUTPUT_DIR, "Check permissions, or set TRIAL_REELS_OUTPUT_DIR.");

if (process.argv.includes("--test")) {
  console.log("\nRunning end-to-end test on the bundled example clip...");
  const example = path.join(REMOTION_DIR, "public", "example.mp4");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trial-reels-check-"));
  try {
    const wav = path.join(tmp, "a.wav");
    run("ffmpeg", ["-v", "error", "-y", "-t", "10", "-i", example, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
    const text = run("whisper-cli", ["-m", MODEL_PATH, "-f", wav, "-l", "en", "-np", "-nt"]);
    const heard = /graduate nurses/i.test(text);
    record("Test: transcription", heard, heard ? `"${text.replace(/\s+/g, " ").slice(0, 60)}…"` : text.slice(0, 80), "Re-run /setup; check the model downloaded fully.");
  } catch (e) {
    record("Test: transcription", false, String(e.message).split("\n")[0], "Re-run /setup.");
  }
  const browser = process.env.TRIAL_REELS_BROWSER ? [`--browser-executable=${process.env.TRIAL_REELS_BROWSER}`] : [];
  for (const [comp, label] of [["TrialReel", "Punchy"], ["Example-Raw", "Raw"], ["Example-News", "News"]]) {
    try {
      const still = path.join(tmp, `${comp}.jpg`);
      execFileSync("npx", ["remotion", "still", comp, still, "--frame=60", "--image-format=jpeg", "--log=error", ...browser], {
        cwd: REMOTION_DIR,
        stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, npm_config_loglevel: "error" },
      });
      const ok = fs.existsSync(still) && fs.statSync(still).size > 50_000;
      record(`Test: render a ${label} frame`, ok, ok ? "rendered OK" : "no image produced", "Re-run /setup.");
    } catch (e) {
      record(`Test: render a ${label} frame`, false, String(e.stderr || e.message).split("\n")[0], "Re-run /setup.");
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

const missing = results.filter((r) => !r.ok && !r.optional);
console.log(missing.length ? `\n${missing.length} item(s) need attention.` : "\nAll good — ready to cut trial reels.");
process.exit(missing.length ? 1 : 0);
