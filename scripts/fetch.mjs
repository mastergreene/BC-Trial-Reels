#!/usr/bin/env node
// Download a Dropbox shared link into ~/Downloads and print the saved file's path.
//
//   node scripts/fetch.mjs "https://www.dropbox.com/scl/fi/…/interview.mp4?rlkey=…&dl=0"
//
// Uses the file's own name. If that file is already in Downloads at the same size,
// it's reused rather than downloaded again.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DOWNLOADS_DIR } from "./lib.mjs";

const link = process.argv[2];
if (!link || !/^https:\/\/(www\.)?dropbox\.com\//.test(link)) {
  console.error('Usage: node scripts/fetch.mjs "<Dropbox shared link to a video file>"');
  process.exit(1);
}
const url = new URL(link);
if (url.pathname.startsWith("/scl/fo/") || url.pathname.startsWith("/sh/"))
  throw new Error("That's a Dropbox folder link. Share a link to the video file itself.");
url.searchParams.set("dl", "1"); // direct download instead of the preview page

const tmp = fs.mkdtempSync(path.join(DOWNLOADS_DIR, ".trial-reels-download-"));
try {
  console.log("Downloading from Dropbox...");
  // -J -O: save under the name Dropbox sends; --fail: error on 4xx/5xx.
  execFileSync("curl", ["-L", "--fail", "-J", "-O", "--progress-bar", url.toString()], {
    cwd: tmp,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const [name] = fs.readdirSync(tmp);
  if (!name) throw new Error("Download produced no file.");
  const downloaded = path.join(tmp, name);

  // Dropbox answers bad or sign-in-only links with a web page, sometimes under a
  // .mp4 name, so check the content rather than trusting the file name.
  let isVideo = false;
  try {
    isVideo = /video/.test(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", downloaded]).toString(),
    );
  } catch {}
  if (!isVideo) {
    const head = fs.readFileSync(downloaded, { encoding: "utf8" }).slice(0, 500);
    if (/<html|<!doctype/i.test(head))
      throw new Error(
        "Dropbox returned a web page, not the video. The link is broken, or it needs a " +
          "sign-in (team-only sharing). Check the link, change sharing to 'Anyone with the " +
          "link', or download the file into Downloads yourself and give its name instead.",
      );
    throw new Error(`Downloaded "${name}", but it isn't a video file.`);
  }

  const dest = path.join(DOWNLOADS_DIR, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(downloaded).size) {
    console.log(`Already in Downloads: ${dest}`);
  } else {
    let final = dest;
    for (let n = 2; fs.existsSync(final); n++)
      final = dest.replace(/(\.[^.]+)$/, ` (${n})$1`);
    fs.renameSync(downloaded, final);
    console.log(`Saved: ${final}`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
