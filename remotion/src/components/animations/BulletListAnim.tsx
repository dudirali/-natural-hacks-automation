import React from "react";
import { spring, interpolate, AbsoluteFill, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { PALETTE } from "./types";

const { fontFamily } = loadFont();

interface Props {
  title: string;
  items: string[];
  localFrame: number;
  fps: number;
  duration: number;
}

/**
 * Title + checklist items revealing one at a time. Each item slides in
 * from the left with a green check icon and fades the previous items
 * to slightly muted (so the newest is most prominent).
 */
export const BulletListAnim: React.FC<Props> = ({ title, items, localFrame, fps, duration }) => {
  const titleIn = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 140 } });

  // Items reveal sequentially. Reserve last 0.4s for fade-out.
  const totalFrames = duration * fps;
  const itemsWindowFrames = totalFrames - 12 - 18; // -title intro, -outro
  const perItem = Math.max(1, itemsWindowFrames / Math.max(items.length, 1));

  const outFade = 1 - interpolate(localFrame, [totalFrames - 12, totalFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${PALETTE.bgDark} 0%, ${PALETTE.bgPanel} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "70px 90px",
        gap: 28,
        opacity: outFade,
      }}
    >
      {/* Title */}
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 60,
          color: PALETTE.accentYellow,
          letterSpacing: "-0.01em",
          opacity: interpolate(titleIn, [0, 1], [0, 1]),
          transform: `translateY(${interpolate(titleIn, [0, 1], [-20, 0])}px)`,
          marginBottom: 8,
        }}
      >
        {title.toUpperCase()}
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {items.map((item, i) => {
          const startAt = 18 + i * perItem;
          const itemIn = spring({ frame: localFrame - startAt, fps, config: { damping: 16, stiffness: 140 } });
          if (itemIn === 0) return null;
          const isLatest = i === items.length - 1 || localFrame < 18 + (i + 1) * perItem;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                opacity: interpolate(itemIn, [0, 1], [0, isLatest ? 1 : 0.85]),
                transform: `translateX(${interpolate(itemIn, [0, 1], [-50, 0])}px)`,
              }}
            >
              <CheckIcon size={50} />
              <span
                style={{
                  fontFamily,
                  fontWeight: 800,
                  fontSize: 44,
                  color: PALETTE.textWhite,
                  textShadow: `0 3px 10px rgba(0,0,0,0.45)`,
                }}
              >
                {item}
              </span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 50,
          right: 60,
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

const CheckIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 50 50" fill="none">
    <circle cx="25" cy="25" r="23" fill={PALETTE.accent} />
    <path d="M14 26 L22 33 L36 17" stroke="#0F1923" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);
