import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

export const thumbnailSchema = z.object({
  /** Filename of the hero image inside public/ (1280x720 jpg/png). */
  heroImage: z.string(),
  /** Short ALL-CAPS hook (3-6 words). */
  hook: z.string(),
  /** One word/number from `hook` that should be rendered in the accent color. */
  accent: z.string(),
  /** Small uppercase kicker label shown above the hook. e.g. "WARNING". */
  kicker: z.string().optional(),
});

export type ThumbnailProps = z.infer<typeof thumbnailSchema>;

export const DEFAULT_THUMBNAIL_PROPS: ThumbnailProps = {
  heroImage: "thumbnail-hero.jpg",
  hook: "7 SILENT SIGNS",
  accent: "7",
  kicker: "WARNING",
};

// Wellness-clickbait palette: deep teal-black for dark, bright yellow for
// curiosity, hot coral-red for urgency. Two-color hierarchy.
const TEXT_WHITE = "#FFFFFF";
const STROKE_BLACK = "#0A0E1A";
const ACCENT_RED = "#FF3D3D";        // urgency / problem word
const ACCENT_YELLOW = "#FFD60A";     // kicker / arrow
const HIGHLIGHT_RING = "#FF3D3D";    // red circle on the image

export const Thumbnail: React.FC<ThumbnailProps> = ({ heroImage, hook, accent, kicker = "WARNING" }) => {
  const runs = splitHookByAccent(hook, accent);
  const charCount = hook.length;
  const titleSize = charCount > 26 ? 96 : charCount > 18 ? 120 : 150;

  // Stroke that scales a bit with size — keep readable at small previews.
  const stroke = 6;

  return (
    <AbsoluteFill style={{ backgroundColor: STROKE_BLACK }}>
      {/* Hero image: positioned RIGHT side, slightly cropped left so text has room.
          Saturation slightly boosted via CSS filter for thumbnail pop. */}
      <AbsoluteFill
        style={{
          left: "auto",
          width: "62%",
          right: 0,
          overflow: "hidden",
        }}
      >
        <Img
          src={staticFile(heroImage)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            filter: "saturate(1.18) contrast(1.06)",
          }}
        />
      </AbsoluteFill>

      {/* Dark blanket on the LEFT half for title legibility */}
      <AbsoluteFill
        style={{
          width: "55%",
          background:
            "linear-gradient(90deg, rgba(10,14,26,0.96) 0%, rgba(10,14,26,0.92) 60%, rgba(10,14,26,0.0) 100%)",
        }}
      />

      {/* Subtle bottom darkening across the whole frame */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Red highlight ring on the hero — draws the eye into the image */}
      <div
        style={{
          position: "absolute",
          right: "13%",
          top: "18%",
          width: 280,
          height: 280,
          border: `10px solid ${HIGHLIGHT_RING}`,
          borderRadius: "50%",
          boxShadow: `0 0 30px rgba(255,61,61,0.55), inset 0 0 30px rgba(255,61,61,0.25)`,
          transform: "rotate(-8deg)",
        }}
      />

      {/* Yellow arrow pointing from the title area to the red circle */}
      <Arrow />

      {/* Channel watermark — bottom-right, subtle */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: 28,
          fontFamily,
          fontWeight: 700,
          fontSize: 24,
          color: "rgba(255,255,255,0.78)",
          textShadow: "0 2px 8px rgba(0,0,0,0.85)",
          letterSpacing: "0.05em",
        }}
      >
        @naturalhacks
      </div>

      {/* Text block — kicker pill + big hook */}
      <div
        style={{
          position: "absolute",
          left: 48,
          top: 70,
          width: "55%",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {/* Kicker: small yellow pill with black text */}
        <div
          style={{
            alignSelf: "flex-start",
            backgroundColor: ACCENT_YELLOW,
            color: "#0A0E1A",
            fontFamily,
            fontWeight: 900,
            fontSize: 34,
            letterSpacing: "0.08em",
            padding: "10px 22px 8px",
            borderRadius: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
            transform: "rotate(-2deg)",
          }}
        >
          {kicker}
        </div>

        {/* Hook: big bold title with mixed accent color */}
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: titleSize,
            lineHeight: 0.92,
            letterSpacing: "-0.015em",
            color: TEXT_WHITE,
            textShadow: [
              `-${stroke}px -${stroke}px 0 ${STROKE_BLACK}`,
              ` ${stroke}px -${stroke}px 0 ${STROKE_BLACK}`,
              `-${stroke}px  ${stroke}px 0 ${STROKE_BLACK}`,
              ` ${stroke}px  ${stroke}px 0 ${STROKE_BLACK}`,
              `0 8px 28px rgba(0,0,0,0.85)`,
            ].join(", "),
          }}
        >
          {runs.map((r, i) => (
            <React.Fragment key={i}>
              <span style={{ color: r.isAccent ? ACCENT_RED : TEXT_WHITE }}>
                {r.text}
              </span>
              {i < runs.length - 1 ? " " : ""}
            </React.Fragment>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Arrow: React.FC = () => (
  <svg
    style={{
      position: "absolute",
      left: "44%",
      top: "32%",
      width: 220,
      height: 200,
      filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.7))",
      transform: "rotate(-10deg)",
    }}
    viewBox="0 0 220 200"
    fill="none"
  >
    {/* Curved arrow shaft */}
    <path
      d="M 10 100 Q 100 30 195 80"
      stroke="#FFD60A"
      strokeWidth="14"
      strokeLinecap="round"
      fill="none"
    />
    {/* Arrowhead */}
    <path
      d="M 195 80 L 170 60 L 175 92 Z"
      fill="#FFD60A"
      stroke="#FFD60A"
      strokeWidth="6"
      strokeLinejoin="round"
    />
  </svg>
);

function splitHookByAccent(hook: string, accent: string): Array<{ text: string; isAccent: boolean }> {
  if (!accent) return [{ text: hook, isAccent: false }];
  const accentNorm = accent.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const words = hook.split(/\s+/);
  return words.map((w) => ({
    text: w,
    isAccent: w.toUpperCase().replace(/[^A-Z0-9]/g, "") === accentNorm,
  }));
}
