#!/usr/bin/env node
// Grab frames from the source with a cropX grid, to identify speakers and choose crops.
//
//   node scripts/frames.mjs "<video>" 12.5 340 1022
//
// Writes frames/t<sec>.jpg in the source's working folder, with a cropX grid (see below).
// Pick the cropX value under the speaker's face, then check it with render.mjs --preview.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveRun } from "./lib.mjs";

const [sourceArg, ...times] = process.argv.slice(2);
const paths = resolveRun(sourceArg);
const src = paths.source;
const outDir = paths.frames;
fs.mkdirSync(outDir, { recursive: true });

// This ffmpeg build has no drawtext, so the grid is lines only: nine yellow
// lines at cropX 0.1 … 0.9, with 0.5 drawn thicker in red.
const lines = [];
for (let i = 1; i <= 9; i++) {
  const centre = i === 5;
  const w = centre ? 6 : 2;
  lines.push(
    `drawbox=x=iw*${i / 10}-${w / 2}:y=0:w=${w}:h=ih:color=${centre ? "red" : "yellow"}@0.85:t=fill`,
  );
}

for (const t of times) {
  const out = path.join(outDir, `t${Number(t).toFixed(1)}.jpg`);
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-ss", String(t), "-i", src, "-frames:v", "1",
    "-vf", `scale=960:-2,${lines.join(",")}`, out,
  ]);
  console.log(out);
}
