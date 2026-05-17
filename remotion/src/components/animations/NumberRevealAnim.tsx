import React from "react";
import { spring, interpolate, AbsoluteFill, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { PALETTE } from "./types";

const { fontFamily } = loadFont();

interface Props {
  number: number | string;
  text: string;
  localFrame: number;
  fps: number;
  duration: number;
}

/**
 * Big number + label, e.g. "7 SIGNS OF MAGNESIUM DEFICIENCY".
 * Number rotates in with a bounce. Text slides in after.
 */
export const NumberRevealAnim: React.FC<Props> = ({ number, text, localFrame, fps, duration }) => {
  const numIn = spring({ frame: localFrame, fps, config: { damping: 9, stiffness: 100, mass: 0.7 } });
  const textIn = spring({ frame: localFrame - 12, fps, config: { damping: 18, stiffness: 140 } });

  const totalFrames = duration * fps;
  const outFade = 1 - interpolate(localFrame, [totalFrames - 12, totalFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  const rotate = interpolate(numIn, [0, 1], [-30, 0]);
  const scale = interpolate(numIn, [0, 1], [0.3, 1]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${PALETTE.bgDark} 0%, ${PALETTE.bgPanel} 100%)`,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 50,
        opacity: outFade,
        padding: 60,
      }}
    >
      {/* Big number */}
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 380,
          lineHeight: 0.85,
          color: PALETTE.accentYellow,
          letterSpacing: "-0.05em",
          transform: `rotate(${rotate}deg) scale(${scale})`,
          opacity: interpolate(numIn, [0, 1], [0, 1]),
          textShadow: `0 10px 40px rgba(251,191,36,0.4), -8px 8px 0 ${PALETTE.bgDark}`,
        }}
      >
        {number}
      </div>

      {/* Label on right */}
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 64,
          lineHeight: 1.05,
          color: PALETTE.textWhite,
          letterSpacing: "-0.01em",
          maxWidth: 600,
          opacity: interpolate(textIn, [0, 1], [0, 1]),
          transform: `translateX(${interpolate(textIn, [0, 1], [40, 0])}px)`,
          textShadow: `0 4px 14px rgba(0,0,0,0.7)`,
        }}
      >
        {text.toUpperCase()}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 50,
          fontFamily,
          fontWeight: 700,
          fontSize: 18,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: "0.1em",
        }}
      >
        @naturalhacks
      </div>
    </AbsoluteFill>
  );
};
