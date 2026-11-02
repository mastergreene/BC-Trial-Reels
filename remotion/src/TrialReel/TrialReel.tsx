import React from "react";
import {
  AbsoluteFill,
  CalculateMetadataFunction,
  Series,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { Captions, CaptionStyle } from "./Captions";
import { Shot } from "./Shot";
import { CardMode, TitleCard } from "./TitleCard";

export const VIBES = ["punchy", "raw", "news"] as const;
export type Vibe = (typeof VIBES)[number];

// What each vibe looks like by default. render.mjs sets these explicitly too, but
// the defaults mean a props file only needs `vibe` to get the right look.
export const VIBE_DEFAULTS: Record<
  Vibe,
  { cardMode: CardMode; captionStyle: CaptionStyle; cardExitSec: number }
> = {
  punchy: { cardMode: "pop_exit", captionStyle: "kinetic", cardExitSec: 2.5 },
  raw: { cardMode: "none", captionStyle: "subtle", cardExitSec: 0 },
  news: { cardMode: "persistent", captionStyle: "block", cardExitSec: 4 },
};

export const shotSchema = z.object({
  src: z.string(),
  trimBeforeSec: z.number(),
  durationSec: z.number(),
  cropX: z.number().min(0).max(1),
  zoom: z.number().min(1),
  zoomEnd: z.number().min(1).optional(),
  sourceAspect: z.number(),
  fadeInFrames: z.number().min(0).optional(),
  fadeOutFrames: z.number().min(0).optional(),
});

export const captionSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  timestampMs: z.number().nullable(),
  confidence: z.number().nullable(),
});

export const trialReelSchema = z.object({
  vibe: z.enum(VIBES),
  label: z.string(),
  headline: z.string(),
  highlight: z.string(),
  // Overrides for the vibe's defaults.
  cardMode: z.enum(["pop_exit", "persistent", "none"]).optional(),
  captionStyle: z.enum(["kinetic", "subtle", "block"]).optional(),
  cardExitSec: z.number().optional(),
  // Optional image perched on top of the card (path in public/ or a URL). None by default.
  badgeSrc: z.string().optional(),
  shots: z.array(shotSchema).min(1),
  // Word-level captions, timed relative to the start of the reel.
  captions: z.array(captionSchema),
});

export type TrialReelProps = z.infer<typeof trialReelSchema>;

export const calculateTrialReelMetadata: CalculateMetadataFunction<TrialReelProps> = ({
  props,
}) => {
  const fps = 30;
  // Sum per-shot frame counts exactly as <Series> lays them out.
  const frames = props.shots.reduce((t, s) => t + Math.round(s.durationSec * fps), 0);
  return { fps, durationInFrames: Math.max(1, frames) };
};

export const TrialReel: React.FC<TrialReelProps> = ({
  vibe,
  label,
  headline,
  highlight,
  cardMode,
  captionStyle,
  cardExitSec,
  badgeSrc,
  shots,
  captions,
}) => {
  const { fps } = useVideoConfig();
  const defaults = VIBE_DEFAULTS[vibe];
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {shots.map((shot, i) => (
          <Series.Sequence
            key={i}
            name={`Shot ${i + 1} (${shot.zoom.toFixed(2)}x)`}
            durationInFrames={Math.round(shot.durationSec * fps)}
          >
            <Shot {...shot} />
          </Series.Sequence>
        ))}
      </Series>
      <Captions captions={captions} captionStyle={captionStyle ?? defaults.captionStyle} />
      <TitleCard
        cardMode={cardMode ?? defaults.cardMode}
        label={label}
        headline={headline}
        highlight={highlight}
        exitSec={cardExitSec ?? defaults.cardExitSec}
        badgeSrc={badgeSrc}
      />
    </AbsoluteFill>
  );
};
