import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envelope, quietRuns, snapShot } from "./edges.mjs";

// Plugin root (this file lives in <root>/scripts).
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REMOTION_DIR = path.join(ROOT, "remotion");
export const WORK_DIR = path.join(REMOTION_DIR, "public/_work");

// Finished reels (and downloaded Dropbox videos) go here. Override with
// TRIAL_REELS_OUTPUT_DIR, or per render with `render.mjs --out <dir>`.
export const DOWNLOADS_DIR = path.join(os.homedir(), "Downloads");
export const OUTPUT_DIR = process.env.TRIAL_REELS_OUTPUT_DIR || DOWNLOADS_DIR;

// Per-user cache: the Whisper model and each run's working files.
export const CACHE_DIR = path.join(os.homedir(), ".cache", "trial-reels");
export const RUNS_DIR = path.join(CACHE_DIR, "runs");
export const MODEL_PATH =
  process.env.TRIAL_REELS_WHISPER_MODEL || path.join(CACHE_DIR, "ggml-large-v3-turbo.bin");

export const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|mxf|avi|webm)$/i;
export const FPS = 30;

export const localDate = () => new Intl.DateTimeFormat("en-CA").format(new Date());

// Resolve the video the user named: a path (~ allowed), or just a file name in ~/Downloads.
export const resolveSource = (arg) => {
  if (!arg) throw new Error("Pass the source video (a path, or a file name in ~/Downloads).");
  const expanded = arg.replace(/^~(?=\/)/, os.homedir());
  const candidates = [path.resolve(expanded), path.join(DOWNLOADS_DIR, expanded)];
  const found = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!found) throw new Error(`Video not found: ${arg} (also looked in ~/Downloads)`);
  return found;
};

// ---------------------------------------------------------------------------
// Vibes

export const VIBES = ["punchy", "raw", "news"];
export const VIBE_NAMES = { punchy: "Punchy", raw: "Raw", news: "News" };

// Parse `--vibe punchy|raw|news|all` (or a comma list, e.g. "punchy,news").
export const parseVibes = (arg) => {
  if (!arg || arg === "all") return [...VIBES];
  const list = arg.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const bad = list.filter((v) => !VIBES.includes(v));
  if (bad.length || list.length === 0)
    throw new Error(`--vibe must be punchy, raw, news, all, or a comma list (got "${arg}")`);
  return VIBES.filter((v) => list.includes(v));
};

// Working files for a source live in ~/.cache/trial-reels/runs/<name>-<hash>/.
// Reels go to the output folder, named after the source so they sort next to it:
//   <title> - Clip <n> [Punchy].mp4
export const runPaths = (sourcePath, outputDir = OUTPUT_DIR) => {
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, "");
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const hash = createHash("sha1").update(sourcePath).digest("hex").slice(0, 6);
  const work = path.join(RUNS_DIR, `${slug}-${hash}`);
  return {
    source: sourcePath,
    title: base,
    work,
    meta: path.join(work, "meta.json"),
    transcript: path.join(work, "transcript.json"),
    transcriptTxt: path.join(work, "transcript.txt"),
    clips: path.join(work, "clips.json"),
    frames: path.join(work, "frames"),
    preview: path.join(work, "preview"),
    props: (id, vibe) => path.join(work, "props", `clip-${id}-${vibe}.json`),
    reel: (id, vibe) => path.join(outputDir, `${base} - Clip ${id} [${VIBE_NAMES[vibe]}].mp4`),
  };
};

// For scripts that run after transcription: the source must already have a transcript.
export const resolveRun = (arg, outputDir) => {
  const paths = runPaths(resolveSource(arg), outputDir);
  if (!fs.existsSync(paths.meta))
    throw new Error(`No transcript yet for ${paths.source}. Run transcribe.mjs first.`);
  return paths;
};

// Drop working folders untouched for 30+ days so the cache doesn't grow forever.
export const pruneOldRuns = (days = 30) => {
  if (!fs.existsSync(RUNS_DIR)) return;
  const cutoff = Date.now() - days * 86_400_000;
  for (const name of fs.readdirSync(RUNS_DIR)) {
    const dir = path.join(RUNS_DIR, name);
    if (fs.statSync(dir).mtimeMs < cutoff) fs.rmSync(dir, { recursive: true, force: true });
  }
};

// Install the template's npm packages on first use (or after a plugin update,
// which replaces the plugin folder).
export const ensureRemotionDeps = () => {
  if (fs.existsSync(path.join(REMOTION_DIR, "node_modules", "remotion"))) return;
  console.log("Installing template packages (first run, ~1 min)...");
  execFileSync("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: REMOTION_DIR,
    stdio: "inherit",
  });
};

export const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

export const fmtTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
};

const round = (s) => Math.round(s * 1000) / 1000;

// ---------------------------------------------------------------------------
// Vibe profiles
//
// Each profile turns a clip's sections (the 1-2 source ranges picked in
// clips.json) into the shots the template plays, plus the card/caption look.
// A shot here is in SOURCE time: { section, startSec, endSec, zoom, zoomEnd?,
// fadeIn, fadeOut } (fades in frames). render.mjs maps it onto the cut section file.
//
// How each vibe snaps the section edges into the real pauses. Punchy cuts in tight;
// Raw and News keep more of the natural breath either side.
export const SNAP = {
  punchy: { leadIn: 0.05, tail: 0.12 },
  raw: { leadIn: 0.12, tail: 0.4 },
  news: { leadIn: 0.12, tail: 0.5 },
};

// Punchy tuning.
const TRIM_MIN_GAP = 0.22; // pauses at least this long are cut out (s)
const TRIM_KEEP_BEFORE = 0.05; // keep this much silence before speech resumes (s)
const TRIM_KEEP_AFTER = 0.08; // keep this much after speech stops (s)
const MIN_SPEECH = 0.12; // drop "speech" runs shorter than this (clicks, breaths) (s)
const PUNCH_MIN_HOLD = 3; // hold each framing at least this long (s)
const PUNCH_MAX_HOLD = 5; // and change framing by this long at the latest (s)
const PUNCH_WIDE = 1.0;
const PUNCH_CLOSE = 1.15;

// News tuning.
const NEWS_ZOOM_START = 1.0;
const NEWS_ZOOM_END = 1.08;

// Snap each picked section's edges for this vibe.
export const snapSections = (vibe, source, words, clip, log = () => {}) =>
  clip.shots.map((picked, k) => {
    if (picked.snap === false) return { ...picked, index: k };
    const snapped = snapShot(source, words, picked, SNAP[vibe]);
    const moved = (a, b) => (a === b ? `${a}` : `${a} → ${b}`);
    log(
      `  [${vibe}] section ${k + 1}: start ${moved(picked.startSec, snapped.startSec)}, ` +
        `end ${moved(picked.endSec, snapped.endSec)}` +
        snapped.notes.map((n) => `\n    ! ${n}`).join(""),
    );
    return { ...picked, startSec: snapped.startSec, endSec: snapped.endSec, index: k };
  });

// Punchy: cut the dead air out of a section. Returns the speech runs to keep.
const speechRuns = (source, section) => {
  const dur = section.endSec - section.startSec;
  const env = envelope(source, section.startSec, dur);
  const gaps = quietRuns(env, TRIM_MIN_GAP).filter(
    // Only gaps fully inside the section; its edges are already snapped.
    ([a, b]) => a > section.startSec + 0.05 && b < section.endSec - 0.05,
  );
  const runs = [];
  let cursor = section.startSec;
  for (const [a, b] of gaps) {
    const keepTo = a + TRIM_KEEP_AFTER;
    const resume = b - TRIM_KEEP_BEFORE;
    if (resume - keepTo < 0.05) continue; // nothing worth removing
    runs.push([cursor, keepTo]);
    cursor = resume;
  }
  runs.push([cursor, section.endSec]);
  return runs.filter(([a, b]) => b - a >= MIN_SPEECH);
};

// A word worth punching in on: a number, money, a percentage, or a long word.
const emphasis = (text) =>
  /\d|\$|%|percent|million|billion|thousand|hundred/i.test(text) ? 3 : text.replace(/\W/g, "").length >= 8 ? 1 : 0;

// Where to split a long stretch of continuous speech for a framing change: a word
// onset inside [fromSec, toSec], preferring emphasis words, then the middle.
const pickSplit = (words, fromSec, toSec) => {
  const mid = (fromSec + toSec) / 2;
  let best = null;
  for (const w of words) {
    const t = w.startMs / 1000 - 0.03;
    if (t < fromSec || t > toSec) continue;
    const score = emphasis(w.text) * 10 - Math.abs(t - mid);
    if (!best || score > best.score) best = { t, score };
  }
  return best ? best.t : mid;
};

const punchyProfile = ({ source, words, sections }) => {
  // 1. Speech runs across the whole clip (jump cuts between them).
  const runs = [];
  for (const section of sections)
    for (const [a, b] of speechRuns(source, section)) runs.push({ section: section.index, a, b });

  // 2. Assign framing: start wide (the card is up), switch on a jump cut once
  //    the current framing has held PUNCH_MIN_HOLD, and force a switch inside
  //    continuous speech (on an emphasis word) if it would pass PUNCH_MAX_HOLD.
  const shots = [];
  let zoom = PUNCH_WIDE;
  let held = 0;
  const toggle = () => {
    zoom = zoom === PUNCH_WIDE ? PUNCH_CLOSE : PUNCH_WIDE;
    held = 0;
  };
  runs.forEach((run, i) => {
    if (i > 0 && held >= PUNCH_MIN_HOLD) toggle();
    let start = run.a;
    let fadeIn = i === 0 ? 3 : 1;
    while (held + (run.b - start) > PUNCH_MAX_HOLD) {
      const from = start + Math.max(0.4, PUNCH_MIN_HOLD - held);
      const to = start + (PUNCH_MAX_HOLD - held);
      if (run.b - to < 0.6 || to <= from) break; // too close to the end to bother
      const split = pickSplit(words, from, to);
      shots.push({ section: run.section, startSec: start, endSec: split, zoom, fadeIn, fadeOut: 0 });
      start = split;
      fadeIn = 0;
      toggle();
    }
    shots.push({
      section: run.section,
      startSec: start,
      endSec: run.b,
      zoom,
      fadeIn,
      fadeOut: i === runs.length - 1 ? 3 : 1,
    });
    held += run.b - start;
  });
  return { shots, cardMode: "pop_exit", captionStyle: "kinetic", cardExitSec: 2.5 };
};

const rawProfile = ({ sections }) => ({
  shots: sections.map((s) => ({
    section: s.index,
    startSec: s.startSec,
    endSec: s.endSec,
    zoom: 1,
    fadeIn: 4,
    fadeOut: 4,
  })),
  cardMode: "none",
  captionStyle: "subtle",
  cardExitSec: 0,
});

const newsProfile = ({ sections, clip }) => {
  // One linear push across the whole reel, carried over a join if there is one.
  const total = sections.reduce((t, s) => t + (s.endSec - s.startSec), 0);
  const zoomAt = (t) => round(NEWS_ZOOM_START + (NEWS_ZOOM_END - NEWS_ZOOM_START) * (t / total));
  let elapsed = 0;
  const shots = sections.map((s) => {
    const dur = s.endSec - s.startSec;
    const shot = {
      section: s.index,
      startSec: s.startSec,
      endSec: s.endSec,
      zoom: zoomAt(elapsed),
      zoomEnd: zoomAt(elapsed + dur),
      fadeIn: 4,
      fadeOut: 4,
    };
    elapsed += dur;
    return shot;
  });
  return {
    shots,
    cardMode: "persistent",
    captionStyle: "block",
    // The card holds until the headline's point has landed, then becomes the strap.
    cardExitSec: Math.min(clip.cardExitSec ?? 4, Math.max(1.5, total - 2)),
  };
};

export const PROFILES = { punchy: punchyProfile, raw: rawProfile, news: newsProfile };

// Per-clip, per-vibe overrides from clips.json, e.g.
//   "vibes": { "punchy": { "cardExitSec": 3 }, "news": { "cardMode": "pop_exit" } }
export const applyOverrides = (vibe, clip, plan) => {
  const o = clip.vibes?.[vibe] ?? {};
  return {
    ...plan,
    ...(o.cardMode ? { cardMode: o.cardMode } : {}),
    ...(o.captionStyle ? { captionStyle: o.captionStyle } : {}),
    ...(o.cardExitSec != null ? { cardExitSec: o.cardExitSec } : {}),
  };
};

// Re-time word captions (source ms) onto the reel. `shots` are the final shots,
// each with srcStartSec, durationSec and section. A word that starts in a
// trimmed gap (Whisper onsets run ~0.15s early or late) is moved to the start of
// the next kept run in the same section, rather than dropped.
export const buildCaptions = (words, shots) => {
  let off = 0;
  const spans = shots.map((s) => {
    const span = { section: s.section, a: s.srcStartSec, b: s.srcStartSec + s.durationSec, off };
    off += s.durationSec;
    return span;
  });
  const total = off;
  const captions = [];
  for (const w of words) {
    const t = w.startMs / 1000;
    let idx = spans.findIndex((s, i) => t >= s.a - (i === 0 || spans[i - 1].section !== s.section ? 0.08 : 0) && t < s.b);
    let startSec;
    if (idx >= 0) {
      startSec = spans[idx].off + Math.max(0, t - spans[idx].a);
    } else {
      // In a gap between two runs of the same section?
      idx = spans.findIndex((s, i) => i > 0 && spans[i - 1].section === s.section && t >= spans[i - 1].b && t < s.a);
      if (idx < 0) continue;
      startSec = spans[idx].off;
    }
    const span = spans[idx];
    const tEnd = w.endMs / 1000;
    const endSec = Math.min(span.off + Math.max(0, Math.min(tEnd, span.b) - span.a), total);
    captions.push({
      text: w.text,
      startMs: Math.round(startSec * 1000),
      endMs: Math.round(Math.max(endSec, startSec + 0.05) * 1000),
      timestampMs: null,
      confidence: null,
    });
  }
  // Keep starts in order and ends not past the next word's start.
  captions.forEach((c, i) => {
    const next = captions[i + 1];
    if (next && next.startMs < c.startMs) next.startMs = c.startMs;
    if (next) c.endMs = Math.max(c.startMs + 30, Math.min(c.endMs, next.startMs));
  });
  return captions;
};
