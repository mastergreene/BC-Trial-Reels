import type { Caption } from "@remotion/captions";
import React, { useMemo } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CAPTION_FONT, INTER_FONT } from "./fonts";
import {
  CAPTION_BOTTOM,
  FRAME,
  NAVY,
  SUBTLE_CAPTION_BOTTOM,
  WHITE,
  YELLOW,
} from "./theme";

export type CaptionStyle = "kinetic" | "subtle" | "block";

type Word = { text: string; startMs: number; endMs: number };
export type Page = { text: string; words: Word[]; startMs: number; endMs: number };

type PageRules = {
  maxWords: number;
  maxChars: number;
  maxGapMs: number;
  // Break after commas too, not just sentence ends.
  breakOnComma: boolean;
  // A page shorter than this is held a little longer, if the gap allows.
  minMs: number;
};

const RULES: Record<CaptionStyle, PageRules> = {
  // Short punchy chunks, one beat at a time.
  kinetic: { maxWords: 3, maxChars: 16, maxGapMs: 300, breakOnComma: true, minMs: 0 },
  // Native subtitle phrases, up to two lines.
  subtle: { maxWords: 9, maxChars: 44, maxGapMs: 600, breakOnComma: false, minMs: 900 },
  // Broadcast blocks: two balanced lines of a full clause.
  block: { maxWords: 12, maxChars: 58, maxGapMs: 700, breakOnComma: false, minMs: 1200 },
};

// Group word-level captions into pages. Break after sentence ends, long pauses,
// and when the page is full.
export const toPages = (captions: Caption[], rules: PageRules): Page[] => {
  const pages: Page[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    pages.push({
      text: cur.map((w) => w.text).join(" "),
      words: cur,
      startMs: cur[0].startMs,
      endMs: cur[cur.length - 1].endMs,
    });
    cur = [];
  };
  const endsSentence = rules.breakOnComma ? /[.?!,;:]$/ : /[.?!]$/;
  for (const c of captions) {
    const text = c.text.trim();
    if (!text) continue;
    const w = { text, startMs: c.startMs, endMs: c.endMs };
    const prev = cur[cur.length - 1];
    const joined = [...cur.map((x) => x.text), text].join(" ");
    if (
      prev &&
      (cur.length >= rules.maxWords ||
        joined.length > rules.maxChars ||
        endsSentence.test(prev.text) ||
        w.startMs - prev.endMs > rules.maxGapMs)
    ) {
      flush();
    }
    cur.push(w);
  }
  flush();
  // Hold each page until the next one starts (when close) so captions don't
  // flicker, and give very short pages a minimum time on screen.
  return pages.map((p, i) => {
    const next = pages[i + 1];
    let endMs = Math.max(p.endMs, p.startMs + rules.minMs);
    if (next) {
      if (next.startMs - p.endMs < 700) endMs = Math.max(endMs, next.startMs);
      endMs = Math.min(endMs, next.startMs);
    }
    return { ...p, endMs };
  });
};

// Punchy: big heavy words at eye level; the word being said sits on a yellow pill.
const Kinetic: React.FC<{ page: Page; ms: number; fps: number }> = ({ page, ms, fps }) => {
  // Each page pops in over 3 frames.
  const age = ((ms - page.startMs) / 1000) * fps;
  const scale = interpolate(age, [0, 3], [0.86, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  let active = page.words.findIndex((w) => ms >= w.startMs && ms < w.endMs);
  if (active === -1) {
    // Between words: keep the last-spoken word lit.
    active = page.words.reduce((a, w, i) => (ms >= w.startMs ? i : a), 0);
  }
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        right: 40,
        bottom: FRAME.height - CAPTION_BOTTOM,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: "6px 4px",
        transform: `scale(${scale})`,
        transformOrigin: "50% 100%",
      }}
    >
      {page.words.map((w, i) => {
        const on = i === active;
        return (
          <span
            key={i}
            style={{
              fontFamily: INTER_FONT,
              fontWeight: 900,
              fontSize: 76,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              color: on ? NAVY : WHITE,
              backgroundColor: on ? YELLOW : "transparent",
              borderRadius: 14,
              padding: "10px 16px 14px",
              WebkitTextStroke: on ? undefined : `3px ${NAVY}`,
              paintOrder: "stroke fill",
              textShadow: on ? undefined : "0 4px 14px rgba(0,0,0,0.55)",
              transform: on ? "scale(1.06) rotate(-1.5deg)" : undefined,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

// Raw: clean white native-style subtitles with a soft drop shadow, lower third.
const Subtle: React.FC<{ page: Page }> = ({ page }) => (
  <div
    style={{
      position: "absolute",
      left: 90,
      right: 90,
      bottom: FRAME.height - SUBTLE_CAPTION_BOTTOM,
      display: "flex",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        fontFamily: CAPTION_FONT,
        fontWeight: 500,
        fontSize: 50,
        lineHeight: 1.25,
        color: WHITE,
        textAlign: "center",
        textWrap: "balance",
        // Soft but strong enough to read over light shirts and walls.
        textShadow:
          "0 2px 4px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.6), 0 0 24px rgba(0,0,0,0.55)",
      }}
    >
      {page.text}
    </div>
  </div>
);

// News: structured two-line subtitle blocks on a navy panel.
const Block: React.FC<{ page: Page }> = ({ page }) => (
  <div
    style={{
      position: "absolute",
      left: 80,
      right: 80,
      bottom: FRAME.height - CAPTION_BOTTOM,
      display: "flex",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        fontFamily: INTER_FONT,
        fontWeight: 700,
        fontSize: 44,
        lineHeight: 1.22,
        color: WHITE,
        textAlign: "center",
        textWrap: "balance",
        backgroundColor: "rgba(21,25,69,0.86)",
        borderRadius: 10,
        padding: "16px 28px 20px",
        maxWidth: 820,
      }}
    >
      {page.text}
    </div>
  </div>
);

export const Captions: React.FC<{ captions: Caption[]; captionStyle?: CaptionStyle }> = ({
  captions,
  captionStyle = "kinetic",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => toPages(captions, RULES[captionStyle]), [captions, captionStyle]);
  const ms = (frame / fps) * 1000;
  const page = pages.find((p) => ms >= p.startMs && ms < p.endMs);
  if (!page) return null;
  if (captionStyle === "subtle") return <Subtle page={page} />;
  if (captionStyle === "block") return <Block page={page} />;
  return <Kinetic page={page} ms={ms} fps={fps} />;
};
