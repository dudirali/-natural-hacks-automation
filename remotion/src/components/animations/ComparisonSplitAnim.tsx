import React from "react";
import { spring, interpolate, AbsoluteFill, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { PALETTE } from "./types";

const { fontFamily } = loadFont();

interface Props {
  leftTitle: string;
  leftItems: string[];
  rightTitle: string;
  rightItems: string[];
  localFrame: number;
  fps: number;
  duration: number;
}

/** Vertical split: red (don't do) on left, green (do this) on right. */
export const ComparisonSplitAnim: React.FC<Props> = ({
  leftTitle,
  leftItems,
  rightTitle,
  rightItems,
  localFrame,
  fps,
  duration,
}) => {
  const splitIn = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 110 } });
  const totalFrames = duration * fps;
  const outFade = 1 - interpolate(localFrame, [totalFrames - 12, totalFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const leftItemsWindow = (totalFrames - 30) / 2;

  return (
    <AbsoluteFill
      style={{
        background: PALETTE.bgDark,
        display: "flex",
        flexDirection: "row",
        opacity: outFade,
      }}
    >
      {/* LEFT (wrong) — red tint */}
      <div
        style={{
          flex: 1,
          background: `linear-gradient(180deg, rgba(248,113,113,0.18) 0%, rgba(15,25,35,1) 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 40px",
          gap: 22,
          opacity: interpolate(splitIn, [0, 1], [0, 1]),
          transform: `translateX(${interpolate(splitIn, [0, 1], [-80, 0])}px)`,
        }}
      >
        {/* X icon */}
        <div
          style={{
            width: 90,
            height: 90,
            borderRadius: "50%",
            background: PALETTE.accentRed,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily,
            fontSize: 60,
            fontWeight: 900,
            color: PALETTE.bgDark,
            boxShadow: `0 6px 18px rgba(248,113,113,0.5)`,
          }}
        >
          ✕
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 54,
            color: PALETTE.accentRed,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {leftTitle}
        </div>
        {leftItems.map((it, i) => {
          const itemIn = spring({ frame: localFrame - 18 - i * (leftItemsWindow / Math.max(leftItems.length, 1)), fps, config: { damping: 18, stiffness: 140 } });
          if (itemIn === 0) return null;
          return (
            <div
              key={i}
              style={{
                fontFamily,
                fontWeight: 700,
                fontSize: 32,
                color: PALETTE.textWhite,
                textAlign: "center",
                textDecoration: "line-through",
                textDecorationColor: PALETTE.accentRed,
                opacity: interpolate(itemIn, [0, 1], [0, 0.92]),
                transform: `translateY(${interpolate(itemIn, [0, 1], [10, 0])}px)`,
              }}
            >
              {it}
            </div>
          );
        })}
      </div>

      {/* Center divider */}
      <div
        style={{
          width: 4,
          background: "rgba(255,255,255,0.15)",
          boxShadow: "0 0 20px rgba(255,255,255,0.1)",
        }}
      />

      {/* RIGHT (do this) — green tint */}
      <div
        style={{
          flex: 1,
          background: `linear-gradient(180deg, rgba(52,211,153,0.18) 0%, rgba(15,25,35,1) 100%)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px 40px",
          gap: 22,
          opacity: interpolate(splitIn, [0, 1], [0, 1]),
          transform: `translateX(${interpolate(splitIn, [0, 1], [80, 0])}px)`,
        }}
      >
        <div
          style={{
            width: 90,
            height: 90,
            borderRadius: "50%",
            background: PALETTE.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily,
            fontSize: 56,
            fontWeight: 900,
            color: PALETTE.bgDark,
            boxShadow: `0 6px 18px rgba(52,211,153,0.5)`,
          }}
        >
          ✓
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 54,
            color: PALETTE.accent,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {rightTitle}
        </div>
        {rightItems.map((it, i) => {
          const itemIn = spring({ frame: localFrame - 24 - i * (leftItemsWindow / Math.max(rightItems.length, 1)), fps, config: { damping: 18, stiffness: 140 } });
          if (itemIn === 0) return null;
          return (
            <div
              key={i}
              style={{
                fontFamily,
                fontWeight: 800,
                fontSize: 32,
                color: PALETTE.textWhite,
                textAlign: "center",
                opacity: interpolate(itemIn, [0, 1], [0, 1]),
                transform: `translateY(${interpolate(itemIn, [0, 1], [10, 0])}px)`,
              }}
            >
              {it}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
