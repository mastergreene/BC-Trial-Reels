import React from "react";
import {
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { HEADLINE_FONT, LABEL_FONT } from "./fonts";
import { CARD, NAVY, STRAP, WHITE, YELLOW } from "./theme";

export type CardMode = "pop_exit" | "persistent" | "none";

const HEADLINE_SQUEEZE = 0.895;
const HEADLINE_SIZE = 87;
const HEADLINE_LEADING = 70 / 87;
// Card inner width (756 - borders - padding = 686px) in pre-squeeze units, with a little slack.
const HEADLINE_MAX_WIDTH = 750;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Canvas text measurement, done fresh each render (no cache) so a measurement
// taken before the font loads can't stick. Uses the full fallback stack, so the
// fit is right whichever face actually renders.
let ctx: CanvasRenderingContext2D | null = null;
const measure = (text: string, size: number) => {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.font = `900 ${size}px ${HEADLINE_FONT}`;
  ctx.letterSpacing = `${-0.01 * size}px`;
  return ctx.measureText(text).width;
};

// Shrink the headline so its longest "\n" line fits on one line.
const fitHeadlineSize = (headline: string) => {
  const widths = headline
    .toUpperCase()
    .split("\n")
    .map((l) => measure(l, HEADLINE_SIZE));
  if (widths.some((w) => w == null)) return HEADLINE_SIZE;
  const widest = Math.max(...(widths as number[]));
  return Math.min(HEADLINE_SIZE, (HEADLINE_SIZE * HEADLINE_MAX_WIDTH) / widest);
};

// Rendered twice: once as the highlight bars only (transparent text), and once as
// plain text on top. With tight leading a single pass paints a lower line's bar
// over the line above it.
export const Headline: React.FC<{
  text: string;
  highlight: string;
  layer: "bars" | "text";
  barColor?: string;
}> = ({ text, highlight, layer, barColor = YELLOW }) => {
  const upper = text.toUpperCase();
  const hl = highlight.toUpperCase();
  const i = hl ? upper.indexOf(hl) : -1;
  if (i === -1) {
    return <>{upper}</>;
  }
  return (
    <>
      {upper.slice(0, i)}
      <span
        style={{
          // Bar spans roughly cap-top to just under the baseline.
          background:
            layer === "bars"
              ? `linear-gradient(transparent 9%, ${barColor} 9%, ${barColor} 98%, transparent 98%)`
              : undefined,
          padding: "0 10px",
          margin: "0 -10px",
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
        }}
      >
        {upper.slice(i, i + hl.length)}
      </span>
      {upper.slice(i + hl.length)}
    </>
  );
};

type CardBodyProps = {
  label: string;
  headline: string;
  highlight: string;
  badgeSrc?: string;
};

// The white card with navy border: label, then the highlighted headline.
const CardBody: React.FC<CardBodyProps> = ({ label, headline, highlight, badgeSrc }) => {
  const headlineSize = fitHeadlineSize(headline);
  return (
    <>
      {badgeSrc ? (
        <Img
          src={badgeSrc.startsWith("http") ? badgeSrc : staticFile(badgeSrc)}
          style={{
            position: "absolute",
            left: "50%",
            top: -46,
            width: 92,
            marginLeft: -46,
            zIndex: 2,
          }}
        />
      ) : null}
      <div
        style={{
          backgroundColor: WHITE,
          border: `${CARD.border}px solid ${NAVY}`,
          boxShadow: "0 0 160px 30px rgba(0,0,0,0.42)",
          // With no badge perched on top, top and bottom padding balance.
          padding: badgeSrc ? "34px 30px 82px" : "46px 30px 62px",
          textAlign: "center",
          color: NAVY,
        }}
      >
        <div
          style={{
            fontFamily: LABEL_FONT,
            fontSize: 22,
            letterSpacing: "0.5em",
            marginRight: "-0.5em",
            lineHeight: 1,
            marginBottom: badgeSrc ? 66 : 44,
          }}
        >
          {label.toUpperCase()}
        </div>
        <div
          style={{
            fontFamily: HEADLINE_FONT,
            fontWeight: 900,
            fontSize: headlineSize,
            lineHeight: `${headlineSize * HEADLINE_LEADING}px`,
            letterSpacing: "-0.01em",
            // Tightens the face a touch for the condensed broadcast look.
            transform: `scaleX(${HEADLINE_SQUEEZE})`,
            width: `${100 / HEADLINE_SQUEEZE}%`,
            marginLeft: `${-(100 / HEADLINE_SQUEEZE - 100) / 2}%`,
            // "\n" in the headline forces a line break; the size is fitted so lines don't wrap.
            whiteSpace: "pre-line",
            textWrap: "balance",
            position: "relative",
          }}
        >
          <div aria-hidden style={{ position: "absolute", inset: 0, color: "transparent" }}>
            <Headline text={headline} highlight={highlight} layer="bars" />
          </div>
          <div style={{ position: "relative" }}>
            <Headline text={headline} highlight={highlight} layer="text" />
          </div>
        </div>
      </div>
    </>
  );
};

// Punchy: snaps in, holds, then at exitSec pops up and drops out of frame with
// vertical motion blur.
const PopExitCard: React.FC<CardBodyProps & { exitSec: number }> = ({ exitSec, ...body }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - Math.round(exitSec * fps);

  // Entrance: a quick overshoot snap so the very first frame already shows the card.
  const enter = interpolate(frame, [0, 6], [0.9, 1], {
    ...clamp,
    easing: Easing.out(Easing.back(2.2)),
  });

  // Exit (frames at 30fps): pop up and hold (0-7), ease back slightly (7-9),
  // then drop out of frame with motion blur (9-14).
  const pop = interpolate(t, [0, 3, 7, 9], [1, 1.05, 1.05, 1.02], {
    ...clamp,
    easing: Easing.out(Easing.quad),
  });
  const lift = interpolate(t, [0, 3, 7, 9], [0, -28, -28, -10], clamp);
  const dropAt = (f: number) =>
    interpolate(f, [9, 14], [0, 1300], { ...clamp, easing: Easing.in(Easing.quad) });
  const drop = dropAt(t);
  const blur = Math.min(70, (drop - dropAt(t - 1)) * 0.25);

  if (t > 14) {
    return null;
  }

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="tr-vblur" x="-10%" y="-60%" width="120%" height="220%">
          <feGaussianBlur stdDeviation={`0 ${blur}`} />
        </filter>
      </svg>
      <div
        style={{
          position: "absolute",
          left: CARD.left,
          top: CARD.top,
          width: CARD.width,
          transform: `translateY(${lift + drop}px) scale(${pop * enter})`,
          transformOrigin: "50% 50%",
          filter: blur > 0.5 ? "url(#tr-vblur)" : undefined,
        }}
      >
        <CardBody {...body} />
      </div>
    </>
  );
};

// Fit the strap headline (all on one or two lines) to the strap's inner width.
const STRAP_SIZE = 58;
const STRAP_INNER = STRAP.width - 64;
const fitStrapSize = (text: string) => {
  const w = measure(text.toUpperCase(), STRAP_SIZE);
  if (w == null) return STRAP_SIZE;
  // Two balanced lines, with slack for word breaks not landing at the midpoint.
  const lines = w > STRAP_INNER ? 2 : 1;
  return Math.min(STRAP_SIZE, (STRAP_SIZE * STRAP_INNER * lines * (lines > 1 ? 0.86 : 1)) / w);
};

// News lower-third strap: yellow label tab over a navy bar, headline in white
// with the highlight picked out in yellow.
const Strap: React.FC<CardBodyProps & { progress: number }> = ({
  label,
  headline,
  highlight,
  progress,
}) => {
  const text = headline.replace(/\s*\n\s*/g, " ");
  const size = fitStrapSize(text);
  const upper = text.toUpperCase();
  const hl = highlight.toUpperCase();
  const i = hl ? upper.indexOf(hl) : -1;
  // Wipe in from the left; the label tab leads the bar slightly.
  const barWipe = interpolate(progress, [0.15, 1], [0, 100], clamp);
  const tabWipe = interpolate(progress, [0, 0.6], [0, 100], clamp);
  return (
    <div style={{ position: "absolute", left: STRAP.left, top: STRAP.top, width: STRAP.width }}>
      <div
        style={{
          display: "inline-block",
          backgroundColor: YELLOW,
          color: NAVY,
          fontFamily: LABEL_FONT,
          fontSize: 24,
          letterSpacing: "0.4em",
          lineHeight: 1,
          padding: "14px 10px 14px 24px",
          clipPath: `inset(0 ${100 - tabWipe}% 0 0)`,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          backgroundColor: NAVY,
          borderLeft: `10px solid ${YELLOW}`,
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
          padding: "22px 32px 26px 22px",
          clipPath: `inset(0 ${100 - barWipe}% 0 0)`,
        }}
      >
        <div
          style={{
            fontFamily: HEADLINE_FONT,
            fontWeight: 900,
            fontSize: size,
            lineHeight: 1.02,
            letterSpacing: "-0.005em",
            color: WHITE,
            textWrap: "balance",
          }}
        >
          {i === -1 ? (
            upper
          ) : (
            <>
              {upper.slice(0, i)}
              <span style={{ color: YELLOW }}>{upper.slice(i, i + hl.length)}</span>
              {upper.slice(i + hl.length)}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// News: the full card opens the reel; at exitSec it eases down and away
// (no blur, measured), and the strap wipes in and stays to the end.
const PersistentCard: React.FC<CardBodyProps & { exitSec: number }> = ({ exitSec, ...body }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - Math.round(exitSec * fps);
  const EXIT = 12;

  const enter = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const out = interpolate(t, [0, EXIT], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const strap = interpolate(t, [EXIT * 0.5, EXIT * 0.5 + 14], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <>
      {out < 1 ? (
        <div
          style={{
            position: "absolute",
            left: CARD.left,
            top: CARD.top,
            width: CARD.width,
            opacity: enter * (1 - out),
            transform: `translateY(${(1 - enter) * 30 + out * 120}px) scale(${1 - out * 0.06})`,
            transformOrigin: "50% 50%",
          }}
        >
          <CardBody {...body} />
        </div>
      ) : null}
      {strap > 0 ? <Strap {...body} progress={strap} /> : null}
    </>
  );
};

type Props = CardBodyProps & {
  exitSec: number;
  cardMode?: CardMode;
};

export const TitleCard: React.FC<Props> = ({ cardMode = "pop_exit", exitSec, ...body }) => {
  if (cardMode === "none") return null;
  if (cardMode === "persistent") return <PersistentCard exitSec={exitSec} {...body} />;
  return <PopExitCard exitSec={exitSec} {...body} />;
};
