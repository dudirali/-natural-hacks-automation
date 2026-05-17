import React from "react";
import { spring, interpolate, AbsoluteFill, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { PALETTE } from "./types";

const { fontFamily } = loadFont();

interface Props {
  quote: string;
  source?: string;
  localFrame: number;
  fps: number;
  duration: number;
}

/** Emphasized quote / fact callout with big curly quotes and source attribution. */
export const QuoteCalloutAnim: React.FC<Props> = ({ quote, source, localFrame, fps, duration }) => {
  const quoteIn = spring({ frame: localFrame, fps, config: { damping: 16, stiffness: 110 } });
  const sourceIn = spring({ frame: localFrame - 18, fps, config: { damping: 18, stiffness: 140 } });
  const totalFrames = duration * fps;
  const outFade = 1 - interpolate(localFrame, [totalFrames - 12, totalFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${PALETTE.bgPanel} 0%, ${PALETTE.bgDark} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 100px",
        gap: 32,
        opacity: outFade,
      }}
    >
      {/* Big opening quote glyph */}
      <div
        style={{
          fontFamily,
          fontSize: 220,
          lineHeight: 0.3,
          color: PALETTE.accentYellow,
          opacity: interpolate(quoteIn, [0, 1], [0, 0.45]),
          alignSelf: "flex-start",
          marginLeft: -20,
          marginBottom: -40,
        }}
      >
        “
      </div>

      <div
        style={{
          fontFamily,
          fontWeight: 800,
          fontStyle: "italic",
          fontSize: 56,
          lineHeight: 1.2,
          color: PALETTE.textCream,
          letterSpacing: "-0.005em",
          textAlign: "center",
          opacity: interpolate(quoteIn, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(quoteIn, [0, 1], [20, 0])}px)`,
          textShadow: `0 4px 16px rgba(0,0,0,0.55)`,
        }}
      >
        {quote}
      </div>

      {source && (
        <div
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 26,
            color: PALETTE.accentYellow,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            opacity: interpolate(sourceIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(sourceIn, [0, 1], [12, 0])}px)`,
          }}
        >
          — {source}
        </div>
      )}
    </AbsoluteFill>
  );
};
