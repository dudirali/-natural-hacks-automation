import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { PALETTE } from "./types";

const { fontFamily } = loadFont();

interface Props {
  /** "30%", "2X", "1 IN 5" — whatever should pop. */
  value: string;
  /** "REDUCTION IN INFLAMMATION" */
  label: string;
  /** "Harvard Study, 2023" */
  source?: string;
  /** Local frame within the animation window. */
  localFrame: number;
  /** Local fps. */
  fps: number;
  /** Total animation duration in seconds. */
  duration: number;
}

/**
 * Big stat callout — used for "30% improvement", "2X better", "1 in 5 people".
 * Value scales in with a small overshoot, label fades up, source slides in last.
 * Out-fade in last 0.4s.
 */
export const StatCalloutAnim: React.FC<Props> = ({ value, label, source, localFrame, fps, duration }) => {
  const valuePop = spring({ frame: localFrame, fps, config: { damping: 12, stiffness: 120, mass: 0.7 } });
  const labelIn = spring({ frame: localFrame - 8, fps, config: { damping: 18, stiffness: 140 } });
  const sourceIn = spring({ frame: localFrame - 18, fps, config: { damping: 18, stiffness: 140 } });

  const totalFrames = duration * fps;
  const outProgress = interpolate(
    localFrame,
    [totalFrames - 12, totalFrames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) }
  );
  const fade = 1 - outProgress;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at center, ${PALETTE.bgPanel} 0%, ${PALETTE.bgDark} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fade,
        gap: 18,
      }}
    >
      {/* Soft circular halo behind value */}
      <div
        style={{
          position: "absolute",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${PALETTE.accent}22 0%, transparent 60%)`,
          transform: `scale(${interpolate(valuePop, [0, 1], [0.5, 1])})`,
        }}
      />

      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 220,
          lineHeight: 1,
          color: PALETTE.accent,
          letterSpacing: "-0.03em",
          transform: `scale(${interpolate(valuePop, [0, 1], [0.4, 1])})`,
          opacity: interpolate(valuePop, [0, 1], [0, 1]),
          textShadow: `0 8px 28px rgba(0,0,0,0.5)`,
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontFamily,
          fontWeight: 800,
          fontSize: 46,
          color: PALETTE.textWhite,
          letterSpacing: "0.02em",
          textAlign: "center",
          maxWidth: "85%",
          opacity: interpolate(labelIn, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(labelIn, [0, 1], [20, 0])}px)`,
          textShadow: `0 4px 16px rgba(0,0,0,0.55)`,
        }}
      >
        {label.toUpperCase()}
      </div>

      {source && (
        <div
          style={{
            fontFamily,
            fontWeight: 600,
            fontSize: 22,
            color: PALETTE.textMuted,
            letterSpacing: "0.08em",
            opacity: interpolate(sourceIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(sourceIn, [0, 1], [12, 0])}px)`,
          }}
        >
          — {source}
        </div>
      )}

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
