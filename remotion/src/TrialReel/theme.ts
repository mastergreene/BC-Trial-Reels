// Signature high-contrast palette. Keep these three; everything else is layout.
export const NAVY = "#151945";
export const YELLOW = "#fbed2a";
export const WHITE = "#ffffff";

export const FRAME = { width: 1080, height: 1920 };

// Centre card (Punchy pop-exit card, and the opening card in News).
export const CARD = {
  left: 162,
  top: 1144,
  width: 756,
  border: 5,
};

// News lower-third strap: replaces the card once it leaves and stays to the end.
// Kept above the bottom ~350px that Reels/TikTok cover with their own UI.
export const STRAP = {
  left: 60,
  top: 1170,
  width: 960,
};

// Kinetic and block captions sit just above the card/strap and stay there after
// the card leaves, so they never jump.
export const CAPTION_BOTTOM = CARD.top - 36;

// Subtle (Raw) captions: lower third, above the platform UI.
export const SUBTLE_CAPTION_BOTTOM = 1560;
