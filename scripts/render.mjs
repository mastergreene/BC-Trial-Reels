#!/usr/bin/env node
// Render the approved clips in the source's clips.json, in up to three vibes each.
//
//   node scripts/render.mjs "<video>"                   every clip, all three vibes
//   node scripts/render.mjs "<video>" --vibe punchy     one vibe (punchy | raw | news | all,
//                                                       or a comma list like punchy,news)
//   node scripts/render.mjs "<video>" --only 2          clip 2 only
//   node scripts/render.mjs "<video>" --preview         stills only (fast crop/card check)
//   node scripts/render.mjs "<video>" --out ~/Desktop   save reels somewhere else
//
// For each clip: snaps each section's edges into real pauses, cuts the sections
// from the source once, then for each vibe builds the shot list (lib.mjs
// profiles), re-times captions, renders
//   <output dir>/<title> - Clip <n> [Punchy|Raw|News].mp4
// strips tool metadata from it, and makes a contact sheet in preview/.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FPS,
  OUTPUT_DIR,
  PROFILES,
  REMOTION_DIR,
  VIBE_NAMES,
  WORK_DIR,
  applyOverrides,
  buildCaptions,
  ensureRemotionDeps,
  parseVibes,
  readJson,
  resolveRun,
  snapSections,
} from "./lib.mjs";

// Rendering goes through the Remotion CLI so it uses remotion.config.ts (rspack).
// TRIAL_REELS_BROWSER points Remotion at a specific Chrome/Chromium if needed.
const remotion = (...cliArgs) =>
  execFileSync(
    "npx",
    [
      "remotion",
      ...cliArgs,
      "--log=error",
      ...(process.env.TRIAL_REELS_BROWSER
        ? [`--browser-executable=${process.env.TRIAL_REELS_BROWSER}`]
        : []),
    ],
    {
      cwd: REMOTION_DIR,
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, npm_config_loglevel: "error" },
    },
  );

// Final step for every reel: strip tool metadata. Removes the container tags
// ("Made with Remotion" comment, ffmpeg encoder tag) and the x264 settings string
// embedded in the H.264 stream (SEI units). Streams are copied, not re-encoded.
const stripMetadata = (file) => {
  const tmp = file.replace(/\.mp4$/, ".clean.mp4");
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", file, "-map", "0", "-c", "copy",
    "-map_metadata", "-1", "-map_chapters", "-1",
    "-metadata:s", "handler_name=", "-metadata:s", "language=und",
    "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
    "-bsf:v", "filter_units=remove_types=6",
    "-movflags", "+faststart",
    tmp,
  ]);
  fs.renameSync(tmp, file);
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const outArg = flag("--out");
const outputDir = outArg ? path.resolve(outArg.replace(/^~(?=\/|$)/, os.homedir())) : OUTPUT_DIR;
const paths = resolveRun(args[0], outputDir);
const only = flag("--only") != null ? Number(flag("--only")) : null;
const vibes = parseVibes(flag("--vibe"));
const previewOnly = args.includes("--preview");

const meta = readJson(paths.meta);
const words = readJson(paths.transcript);
const { clips } = readJson(paths.clips);
const source = paths.source;
ensureRemotionDeps();

fs.mkdirSync(paths.preview, { recursive: true });
fs.mkdirSync(path.dirname(paths.props(0, "raw")), { recursive: true });
if (!previewOnly) fs.mkdirSync(outputDir, { recursive: true });

// Scratch space inside remotion/public. Cleared each run so the bundle only
// copies this run's sections.
fs.rmSync(WORK_DIR, { recursive: true, force: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

const validate = (clip) => {
  for (const k of ["id", "shots"])
    if (clip[k] == null) throw new Error(`Clip ${clip.id}: missing ${k}`);
  // Raw has no on-screen text; Punchy and News need the card text.
  if (vibes.some((v) => v !== "raw")) {
    for (const k of ["label", "headline", "highlight"])
      if (clip[k] == null) throw new Error(`Clip ${clip.id}: missing ${k}`);
    if (!clip.headline.toUpperCase().includes(clip.highlight.toUpperCase()))
      throw new Error(`Clip ${clip.id}: highlight "${clip.highlight}" not found in headline`);
  }
  if (clip.shots.length > 2) throw new Error(`Clip ${clip.id}: max two joined sections`);
  for (const s of clip.shots)
    if (!(s.endSec > s.startSec)) throw new Error(`Clip ${clip.id}: bad shot times`);
};

const q = (sec) => Math.round(sec * FPS) / FPS; // to the frame

// Cut each section once, wide enough to cover every vibe's snapped edges.
// Frame-accurate (seek before input + re-encode), scaled to 1920 tall max: full
// resolution for a 9:16 crop at zoom 1, and keeps 4K out of the browser.
const cutSections = (clip, snappedByVibe) =>
  clip.shots.map((_, k) => {
    const starts = Object.values(snappedByVibe).map((secs) => secs[k].startSec);
    const ends = Object.values(snappedByVibe).map((secs) => secs[k].endSec);
    const fileStart = Math.max(0, Math.min(...starts) - 0.2);
    const fileEnd = Math.max(...ends) + 0.2;
    const file = `clip-${clip.id}-section-${k + 1}.mp4`;
    execFileSync("ffmpeg", [
      "-v", "error", "-y", "-ss", String(fileStart), "-i", source, "-t", String(fileEnd - fileStart),
      "-vf", "scale=-2:'min(1920,ih)'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", path.join(WORK_DIR, file),
    ]);
    return { src: `_work/${file}`, fileStart, cropX: clip.shots[k].cropX ?? 0.5 };
  });

// Turn a vibe's plan (source-time shots) into template props.
const buildProps = (vibe, clip, plan, sectionFiles) => {
  const shots = plan.shots
    .map((s) => {
      const file = sectionFiles[s.section];
      // Quantise to frames so <Series> timing, audio and captions line up exactly.
      const trimBeforeSec = q(s.startSec - file.fileStart);
      const durationSec = q(s.endSec - s.startSec);
      return {
        section: s.section,
        srcStartSec: file.fileStart + trimBeforeSec,
        shot: {
          src: file.src,
          trimBeforeSec,
          durationSec,
          cropX: clip.shots[s.section].cropX ?? 0.5,
          zoom: s.zoom,
          ...(s.zoomEnd ? { zoomEnd: s.zoomEnd } : {}),
          sourceAspect: meta.width / meta.height,
          fadeInFrames: s.fadeIn,
          fadeOutFrames: s.fadeOut,
        },
      };
    })
    .filter((s) => s.shot.durationSec >= 2 / FPS);
  const captions = buildCaptions(
    words,
    shots.map((s) => ({ section: s.section, srcStartSec: s.srcStartSec, durationSec: s.shot.durationSec })),
  );
  return {
    vibe,
    label: clip.label ?? "",
    headline: clip.headline ?? "",
    highlight: clip.highlight ?? "",
    cardMode: plan.cardMode,
    captionStyle: plan.captionStyle,
    cardExitSec: plan.cardExitSec,
    ...(clip.badgeSrc ? { badgeSrc: clip.badgeSrc } : {}),
    shots: shots.map((s) => s.shot),
    captions,
  };
};

const selected = clips.filter((c) => only == null || c.id === only);
if (selected.length === 0) throw new Error("No clips selected");
selected.forEach(validate);

const jobs = [];
for (const clip of selected) {
  console.log(`Cutting clip ${clip.id}...`);
  const snappedByVibe = {};
  for (const vibe of vibes) snappedByVibe[vibe] = snapSections(vibe, source, words, clip, console.log);
  const sectionFiles = cutSections(clip, snappedByVibe);
  for (const vibe of vibes) {
    const plan = applyOverrides(
      vibe,
      clip,
      PROFILES[vibe]({ source, words, clip, sections: snappedByVibe[vibe] }),
    );
    const props = buildProps(vibe, clip, plan, sectionFiles);
    const totalSec = props.shots.reduce((t, s) => t + s.durationSec, 0);
    const kept = snappedByVibe[vibe].reduce((t, s) => t + s.endSec - s.startSec, 0);
    const cuts = props.shots.length - 1;
    console.log(
      `  [${vibe}] ${totalSec.toFixed(1)}s, ${props.shots.length} shot(s)` +
        (vibe === "punchy" ? `, ${(kept - totalSec).toFixed(1)}s of dead air trimmed, ${cuts} cut(s)` : ""),
    );
    fs.writeFileSync(paths.props(clip.id, vibe), JSON.stringify(props, null, 1));
    jobs.push({ clip, vibe, props });
  }
}

for (const { clip, vibe, props } of jobs) {
  const propsFile = paths.props(clip.id, vibe);
  const totalFrames = props.shots.reduce((t, s) => t + Math.round(s.durationSec * FPS), 0);
  const name = `Clip ${clip.id} [${VIBE_NAMES[vibe]}]`;

  if (previewOnly) {
    // Card on screen (if any), just after it leaves, a close-up (Punchy), and
    // points through the reel for crop and captions.
    const stills = [Math.min(30, totalFrames - 1)];
    if (props.cardMode !== "none")
      stills.push(Math.min(Math.round(props.cardExitSec * FPS) + 30, totalFrames - 1));
    let f = 0;
    const close = props.shots.find((s) => {
      if (s.zoom > 1.05 && !s.zoomEnd) return true;
      f += Math.round(s.durationSec * FPS);
      return false;
    });
    if (close) stills.push(f + Math.round((close.durationSec * FPS) / 2));
    stills.push(Math.round(totalFrames * 0.5), Math.round(totalFrames * 0.85));
    const files = [];
    for (const [i, frame] of [...new Set(stills)].sort((a, b) => a - b).entries()) {
      const out = path.join(paths.preview, `clip-${clip.id}-${vibe}-still-${i + 1}.jpg`);
      remotion("still", "TrialReel", out, `--props=${propsFile}`, `--frame=${frame}`, "--image-format=jpeg");
      files.push(out);
    }
    console.log(`${name}: stills -> ${files.join(", ")}`);
    continue;
  }

  const out = paths.reel(clip.id, vibe);
  console.log(`Rendering ${name} (${(totalFrames / FPS).toFixed(1)}s)...`);
  remotion("render", "TrialReel", out, `--props=${propsFile}`, "--codec=h264", "--crf=18");
  stripMetadata(out);
  const sheet = path.join(paths.preview, `clip-${clip.id}-${vibe}.jpg`);
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", out, "-vf", "fps=1,scale=180:-2,tile=10x4", "-frames:v", "1", sheet,
  ]);
  console.log(`${name}: ${out} (preview ${sheet})`);
}

fs.rmSync(WORK_DIR, { recursive: true, force: true });
