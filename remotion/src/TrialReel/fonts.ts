import { loadFont as loadArchivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadNotoSans } from "@remotion/google-fonts/NotoSans";
import { continueRender, delayRender } from "remotion";

// Label ("WATCH" / "BREAKING" / ...): wide heavy geometric.
export const LABEL_FONT = loadArchivoBlack("normal", {
  weights: ["400"],
  subsets: ["latin"],
}).fontFamily;

// Subtle captions: plain native-app sans.
export const CAPTION_FONT = loadNotoSans("normal", {
  weights: ["500"],
  subsets: ["latin"],
}).fontFamily;

// Bundled heavy sans: kinetic/block captions, and the headline fallback when
// Helvetica Neue Condensed Black isn't installed (e.g. not on a Mac).
export const INTER_FONT = loadInter("normal", {
  weights: ["700", "800", "900"],
  subsets: ["latin"],
}).fontFamily;

// Headline: Helvetica Neue Condensed Black, a macOS system font, loaded with
// local() rather than bundled. Falls back to Inter Black, then Arial Black.
const HEADLINE_FACE = "TR Headline";
export const HEADLINE_FONT = `"${HEADLINE_FACE}", "${INTER_FONT}", "Arial Black", "Helvetica Neue", Arial, sans-serif`;

const style = document.createElement("style");
style.textContent = `
@font-face {
  font-family: "${HEADLINE_FACE}";
  src: local("HelveticaNeue-CondensedBlack"), local("Helvetica Neue Condensed Black");
  font-weight: 900;
}`;
document.head.appendChild(style);

const handle = delayRender("Loading headline font");
document.fonts
  .load(`900 70px "${HEADLINE_FACE}"`)
  .then((faces) => {
    if (faces.length === 0) {
      console.warn(
        "Helvetica Neue Condensed Black not found; headline falls back to Inter Black.",
      );
    }
    return document.fonts.load(`900 70px "${INTER_FONT}"`);
  })
  .then(() => continueRender(handle))
  .catch(() => continueRender(handle));
