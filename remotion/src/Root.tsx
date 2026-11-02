import React from "react";
import { Composition } from "remotion";
import exampleCaptions from "./TrialReel/example-captions.json";
import {
  calculateTrialReelMetadata,
  TrialReel,
  trialReelSchema,
  TrialReelProps,
} from "./TrialReel/TrialReel";

// Example props on the bundled public/example.mp4 (a 720x656, 23.6s clip), so
// each vibe can be previewed in Remotion Studio (`npm run dev`).
const EXAMPLE_SEC = 23.6;
const base = {
  src: "example.mp4",
  cropX: 0.5,
  sourceAspect: 720 / 656,
};
const card = {
  label: "WATCH",
  headline: "500 more graduate\nnurses & midwives\nfor our hospitals",
  highlight: "500 more",
};

// Punchy: alternating 1.0x / 1.15x every few seconds. Splits inside continuous
// speech have no audio fade, so only the zoom changes.
const punchyCuts = [0, 3.6, 7.4, 10.88, 14.6, 18.4, EXAMPLE_SEC];
const punchyProps: TrialReelProps = {
  vibe: "punchy",
  ...card,
  shots: punchyCuts.slice(0, -1).map((start, i) => ({
    ...base,
    trimBeforeSec: start,
    durationSec: punchyCuts[i + 1] - start,
    zoom: i % 2 ? 1.15 : 1,
    fadeInFrames: i === 0 ? 3 : 0,
    fadeOutFrames: i === punchyCuts.length - 2 ? 3 : 0,
  })),
  captions: exampleCaptions,
};

const rawProps: TrialReelProps = {
  vibe: "raw",
  ...card,
  shots: [{ ...base, trimBeforeSec: 0, durationSec: EXAMPLE_SEC, zoom: 1 }],
  captions: exampleCaptions,
};

const newsProps: TrialReelProps = {
  vibe: "news",
  ...card,
  cardExitSec: 4,
  shots: [{ ...base, trimBeforeSec: 0, durationSec: EXAMPLE_SEC, zoom: 1, zoomEnd: 1.08 }],
  captions: exampleCaptions,
};

const comp = {
  component: TrialReel,
  schema: trialReelSchema,
  calculateMetadata: calculateTrialReelMetadata,
  durationInFrames: 1,
  fps: 30,
  width: 1080,
  height: 1920,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* render.mjs renders every vibe through this one, with props from the clip. */}
      <Composition id="TrialReel" defaultProps={punchyProps} {...comp} />
      <Composition id="Example-Raw" defaultProps={rawProps} {...comp} />
      <Composition id="Example-News" defaultProps={newsProps} {...comp} />
    </>
  );
};
