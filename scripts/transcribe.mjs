#!/usr/bin/env node
// Transcribe a source video with whisper.cpp.
//
//   node scripts/transcribe.mjs "<video path or file name in ~/Downloads>" [--names "Jane Smith, Acme Health"]
//
// --names primes Whisper with proper nouns (people, organisations, places) so they're
// spelled right. Writes meta.json, transcript.json and transcript.txt to the source's
// working folder (~/.cache/trial-reels/runs/<name>-<hash>/) and prints where they are.
// transcript.json: word-level [{text, startMs, endMs}] relative to the source file.
// transcript.txt: sentence lines with [start–end] seconds, for reading and picking clips.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MODEL_PATH, fmtTime, localDate, pruneOldRuns, resolveSource, runPaths } from "./lib.mjs";

const args = process.argv.slice(2);
const source = args[0];
if (!source) {
  console.error('Usage: node scripts/transcribe.mjs <video> [--names "A, B"]');
  process.exit(1);
}
const namesIdx = args.indexOf("--names");
const extraNames = namesIdx >= 0 ? args[namesIdx + 1] : "";

const sourcePath = resolveSource(source);
if (!fs.existsSync(MODEL_PATH))
  throw new Error(`Whisper model not found at ${MODEL_PATH}. Run /setup first.`);

pruneOldRuns();
const paths = runPaths(sourcePath);
fs.mkdirSync(paths.work, { recursive: true });

// Metadata
const probe = JSON.parse(
  execFileSync("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", sourcePath,
  ]).toString(),
);
const video = probe.streams.find((s) => s.codec_type === "video");
const [num, den] = video.r_frame_rate.split("/").map(Number);
const meta = {
  date: localDate(),
  source: sourcePath,
  width: video.width,
  height: video.height,
  fps: num / den,
  durationSec: Number(probe.format.duration),
};
fs.writeFileSync(paths.meta, JSON.stringify(meta, null, 2));
console.log(`Source: ${sourcePath}`);
console.log(`Working files: ${paths.work}`);
console.log(`Video: ${meta.width}x${meta.height} @ ${meta.fps.toFixed(2)}fps, ${fmtTime(meta.durationSec)}`);

// Audio -> 16kHz mono WAV in a temp dir
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trial-reels-"));
const wav = path.join(tmp, "audio.wav");
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", sourcePath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);

console.log("Transcribing (whisper large-v3-turbo)...");
const outBase = path.join(tmp, "whisper");
execFileSync(
  "whisper-cli",
  [
    // -dtw aligns each token to the audio; plain segment times drift up to ~1s.
    // DTW needs flash attention off.
    "-m", MODEL_PATH, "-f", wav, "-l", "en", "-ml", "1", "-sow", "-ojf", "-np",
    "-dtw", "large.v3.turbo", "-nfa",
    "-t", String(Math.max(4, os.cpus().length - 2)),
    "-of", outBase,
    ...(extraNames ? ["--prompt", extraNames.replace(/\.?$/, ".")] : []),
  ],
  { stdio: ["ignore", "ignore", "inherit"], maxBuffer: 1 << 30 },
);

const raw = JSON.parse(fs.readFileSync(outBase + ".json", "utf8"));
// Word start = its first token's DTW time (t_dtw, in 10ms units), falling back to the
// segment time. Word end = its last token's DTW time plus a syllable, capped at the
// next word's start. These are close (~0.15s); render.mjs snaps cuts to real pauses.
const dtwTimes = (s) =>
  s.tokens.filter((t) => !t.text.startsWith("[") && t.t_dtw >= 0).map((t) => t.t_dtw * 10);
const words = raw.transcription
  .map((s) => {
    const dtw = dtwTimes(s);
    return {
      text: s.text.trim(),
      startMs: dtw.length ? dtw[0] : s.offsets.from,
      endMs: dtw.length ? dtw[dtw.length - 1] + 300 : s.offsets.to,
    };
  })
  .filter((w) => w.text && !/^\[.*\]$/.test(w.text) && !/^\(.*\)$/.test(w.text));
words.forEach((w, i) => {
  const next = words[i + 1];
  if (next && next.startMs < w.startMs) next.startMs = w.startMs;
  if (next) w.endMs = Math.min(w.endMs, next.startMs);
  w.endMs = Math.max(w.endMs, w.startMs + 50);
});
fs.writeFileSync(paths.transcript, JSON.stringify(words, null, 1));

// Sentence lines. Pauses over 1.5s get a blank line: often a speaker change or a question.
const lines = [];
let cur = [];
const flush = () => {
  if (!cur.length) return;
  lines.push(
    `[${(cur[0].startMs / 1000).toFixed(2)}–${(cur[cur.length - 1].endMs / 1000).toFixed(2)}] ` +
      cur.map((w) => w.text).join(" "),
  );
  cur = [];
};
words.forEach((w, i) => {
  const prev = words[i - 1];
  if (prev && w.startMs - prev.endMs > 1500) {
    flush();
    lines.push("");
  }
  cur.push(w);
  if (/[.?!]$/.test(w.text)) flush();
});
flush();
fs.writeFileSync(paths.transcriptTxt, lines.join("\n") + "\n");
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`Done: ${words.length} words -> ${paths.transcriptTxt}`);
