// Snap shot edges to the real pauses in the audio.
//
// Whisper's word times are close but not exact (DTW times land within ~0.15s of the
// word; without DTW they can be a second out). So render.mjs doesn't trust them for
// the cut itself: it uses them to find the right pause, then cuts inside that pause.
//
//   start: just before the first word's sound begins
//   end:   a beat after the last word's sound stops, never into the next word
//
// Each vibe passes its own lead-in and tail: Punchy cuts tight, Raw and News keep
// more of the natural pause. envelope() and quietRuns() are also used by the
// Punchy profile in lib.mjs to find the dead air it trims inside a shot.

import { execFileSync } from "node:child_process";

const STEP = 0.01; // envelope resolution (s)
const MIN_GAP = 0.1; // shortest quiet run that counts as a pause (s)
export const DEFAULT_LEAD_IN = 0.08; // cut this long before speech starts (s)
export const DEFAULT_TAIL = 0.25; // keep this much of the pause after speech ends (s)

// Loudness (dB) per 10ms of the source's audio, from `fromSec` for `durSec`.
export const envelope = (source, fromSec, durSec) => {
  const from = Math.max(0, fromSec);
  const pcm = execFileSync(
    "ffmpeg",
    ["-v", "error", "-ss", String(from), "-t", String(durSec), "-i", source,
      "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
    { maxBuffer: 1 << 26 },
  );
  const per = 160; // samples per 10ms at 16kHz
  const db = [];
  for (let i = 0; i + per * 2 <= pcm.length; i += per * 2) {
    let sum = 0;
    for (let j = 0; j < per; j++) sum += pcm.readInt16LE(i + j * 2) ** 2;
    db.push(10 * Math.log10(sum / per / 32768 ** 2 + 1e-10));
  }
  return { from, db };
};

// Quiet runs ([startSec, endSec]) in an envelope. "Quiet" is relative to the room:
// a few dB above the noise floor, or a quarter of the way up to speech level.
export const quietRuns = ({ from, db }, minGap = MIN_GAP) => {
  const sorted = [...db].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const speech = sorted[Math.floor(sorted.length * 0.9)];
  const threshold = floor + Math.max(6, (speech - floor) * 0.25);
  // Smooth over 50ms so a single loud or quiet frame doesn't split a run.
  const smooth = db.map((_, i) => {
    const w = db.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
  const runs = [];
  let start = null;
  smooth.forEach((v, i) => {
    if (v < threshold && start == null) start = i;
    if ((v >= threshold || i === smooth.length - 1) && start != null) {
      const end = v >= threshold ? i : i + 1;
      if ((end - start) * STEP >= minGap) runs.push([from + start * STEP, from + end * STEP]);
      start = null;
    }
  });
  return runs;
};

const round = (s) => Math.round(s * 100) / 100;

// Returns { startSec, endSec, notes } for one shot. `words` is transcript.json.
export const snapShot = (source, words, shot, { leadIn = DEFAULT_LEAD_IN, tail = DEFAULT_TAIL } = {}) => {
  const startMs = shot.startSec * 1000;
  const endMs = shot.endSec * 1000;
  const firstIdx = words.findIndex((w) => w.startMs >= startMs - 150);
  let lastIdx = -1;
  words.forEach((w, i) => {
    if (w.startMs < endMs) lastIdx = i;
  });
  const notes = [];
  let { startSec, endSec } = shot;
  if (firstIdx < 0 || lastIdx < firstIdx) return { startSec, endSec, notes: ["no words in shot"] };

  // Start: the last pause that ends near the first word's onset. DTW onsets can be
  // ~0.15s late, so allow the pause to end a little after it.
  const first = words[firstIdx].startMs / 1000;
  const prev = words[firstIdx - 1];
  const startWin = envelope(source, first - 1.5, 2);
  const before = quietRuns(startWin).filter(
    ([a, b]) => b <= first + 0.2 && b >= first - 0.6 && (!prev || b > prev.startMs / 1000),
  );
  if (before.length) {
    const [a, b] = before[before.length - 1];
    startSec = round(Math.max(a, b - leadIn));
  } else {
    notes.push(`no pause found before "${words[firstIdx].text}" — start left as is`);
  }

  // End: the first pause after the last word, before the next word starts. DTW
  // often lands late in a word (near its end), so look from a little before it.
  const last = words[lastIdx];
  const next = words[lastIdx + 1];
  const lastOnset = last.startMs / 1000;
  const nextOnset = next ? next.startMs / 1000 : lastOnset + 3;
  const prevOnset = lastIdx > 0 ? words[lastIdx - 1].startMs / 1000 : 0;
  const endWin = envelope(source, lastOnset - 1, Math.min(nextOnset - lastOnset + 1.6, 5));
  const after = quietRuns(endWin).filter(
    ([a]) => a > Math.max(prevOnset, lastOnset - 0.35) && a < nextOnset + 0.3,
  );
  // A real pause is usually 150ms+; shorter runs can be a stop consonant mid-word.
  // Prefer the first real pause that starts after the last word's onset: a gap
  // just before it is usually a stop consonant inside the word (e.g. "hos-pital"),
  // and cutting there clips the final word.
  const real = after.filter(([a, b]) => b - a >= 0.15);
  const pause =
    real.find(([a]) => a >= lastOnset) ??
    [...real].sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0] ??
    after[0];
  if (pause) {
    const [a, b] = pause;
    // Keep `tail` of the pause, but stop well short of whatever comes next.
    const latest = Math.max(a + (b - a) / 2, b - 0.12);
    endSec = round(Math.min(a + tail, latest));
  } else {
    notes.push(`no pause found after "${last.text}" — end left as is`);
  }

  return { startSec, endSec, notes };
};
