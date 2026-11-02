import { Video } from "@remotion/media";
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const DEFAULT_FADE_FRAMES = 4;

type Props = {
  src: string;
  trimBeforeSec: number;
  durationSec: number;
  // Horizontal centre of the 9:16 crop within the source, 0 = left edge, 1 = right edge.
  cropX: number;
  // 1 = fill the frame. >1 punches in. zoomEnd drifts to that zoom over the shot.
  zoom: number;
  zoomEnd?: number;
  // Source width / height, e.g. 16/9 for broadcast footage.
  sourceAspect: number;
  // Audio fade at each edge, in frames. Jump cuts in silence need only 1; a
  // split inside continuous speech (zoom change only) uses 0 so nothing dips.
  fadeInFrames?: number;
  fadeOutFrames?: number;
};

export const Shot: React.FC<Props> = ({
  src,
  trimBeforeSec,
  durationSec,
  cropX,
  zoom,
  zoomEnd,
  sourceAspect,
  fadeInFrames = DEFAULT_FADE_FRAMES,
  fadeOutFrames = DEFAULT_FADE_FRAMES,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const scale = interpolate(
    frame,
    [0, durationSec * fps],
    [zoom, zoomEnd ?? zoom],
    { extrapolateRight: "clamp" },
  );

  // Size the video box to cover the frame at the source's aspect ratio, then
  // slide it so cropX sits in the middle (clamped so no edge shows).
  // <Video> draws to a canvas, so CSS object-position can't do this.
  const boxW = Math.max(width, height * sourceAspect);
  const boxH = boxW / sourceAspect;
  const left = Math.min(0, Math.max(width - boxW, width / 2 - cropX * boxW));
  const top = (height - boxH) / 2;

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "black" }}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          // Zoom towards the upper-middle so faces stay in frame.
          transformOrigin: "50% 35%",
        }}
      >
        <Video
          src={src.startsWith("http") ? src : staticFile(src)}
          trimBefore={Math.round(trimBeforeSec * fps)}
          objectFit="fill"
          // Short fades at each cut so joins and clip edges don't click.
          volume={(f) => {
            const end = durationSec * fps;
            const fadeIn = fadeInFrames > 0 ? Math.min(1, f / fadeInFrames) : 1;
            const fadeOut = fadeOutFrames > 0 ? Math.min(1, (end - f) / fadeOutFrames) : 1;
            return Math.max(0, Math.min(fadeIn, fadeOut));
          }}
          style={{ position: "absolute", left, top, width: boxW, height: boxH }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
