import React from "react";
import { spring, interpolate, AbsoluteFill, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { PALETTE } from "./types";

const { fontFamily } = loadFont();

interface Props {
  headline: string;
  body?: string;
  localFrame: number;
  fps: number;
  duration: number;
}

/** Full-screen red warning card — for "NEVER do this" moments. */
export const WarningCardAnim: React.FC<Props> = ({ headline, body, localFrame, fps, duration }) => {
  const cardIn = spring({ frame: localFrame, fps, config: { damping: 10, stiffness: 120, mass: 0.6 } });
  const headIn = spring({ frame: localFrame - 6, fps, config: { damping: 18, stiffness: 140 } });
  const bodyIn = spring({ frame: localFrame - 14, fps, config: { damping: 18, stiffness: 140 } });
  const totalFrames = duration * fps;
  const outFade = 1 - interpolate(localFrame, [totalFrames - 12, totalFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  // Subtle shake on the icon
  const shake = Math.sin((localFrame / fps) * Math.PI * 8) * 2;

  return (
    <AbsoluteFill
      style={{
        background: `repeating-linear-gradient(135deg, ${PALETTE.bgDark} 0px, ${PALETTE.bgDark} 60px, #1a0f15 60px, #1a0f15 120px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        padding: 80,
        opacity: outFade,
      }}
    >
      {/* Red bordered card */}
      <div
        style={{
          background: PALETTE.bgPanel,
          border: `8px solid ${PALETTE.accentRed}`,
          borderRadius: 22,
          padding: "50px 70px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          maxWidth: "85%",
          boxShadow: `0 16px 50px rgba(248,113,113,0.4)`,
          transform: `scale(${interpolate(cardIn, [0, 1], [0.7, 1])})`,
          opacity: interpolate(cardIn, [0, 1], [0, 1]),
        }}
      >
        <div
          style={{
            fontSize: 110,
            transform: `translateX(${shake}px)`,
          }}
        >
          ⚠️
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 76,
            color: PALETTE.accentRed,
            letterSpacing: "0.03em",
            textAlign: "center",
            textTransform: "uppercase",
            opacity: interpolate(headIn, [0, 1], [0, 1]),
          }}
        >
          {headline}
        </div>
        {body && (
          <div
            style={{
              fontFamily,
              fontWeight: 600,
              fontSize: 32,
              color: PALETTE.textWhite,
              textAlign: "center",
              lineHeight: 1.3,
              maxWidth: "100%",
              opacity: interpolate(bodyIn, [0, 1], [0, 1]),
            }}
          >
            {body}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
