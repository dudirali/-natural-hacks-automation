import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import type { Section } from "./SectionBadge";

const { fontFamily } = loadFont();

interface Props {
  sections: Section[];
  /** Lead-in time before next section (how early to start showing the card). */
  leadInSeconds?: number;
  /** Bounding box (canvas area) — keeps card within frame. */
  canvasBox: { left: number; top: number; right: number; bottom: number };
}

/**
 * "Coming up: SIGN 3 — Brittle Fingernails" card.
 * Shown in the final 2.0–2.5 seconds before each NEW section starts,
 * sliding in from the right of the canvas. Massive retention boost:
 * gives the viewer a promise they want to wait for.
 */
export const ComingUpCard: React.FC<Props> = ({ sections, leadInSeconds = 2.2, canvasBox }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (!sections.length) return null;

  // Find the next section whose start is within `leadInSeconds` from now.
  const next = sections.find((s) => t >= s.start - leadInSeconds && t < s.start);
  if (!next) return null;

  // Skip teasing the very first section — there's no "before" gap for it.
  const idx = sections.indexOf(next);
  if (idx === 0) return null;

  const teaseStartLocal = frame - Math.floor((next.start - leadInSeconds) * fps);
  const inSpring = spring({
    frame: teaseStartLocal,
    fps,
    config: { damping: 16, stiffness: 130 },
  });
  // Slide out in the last 0.3s before the actual section begins.
  const slideOut = interpolate(
    t,
    [next.start - 0.3, next.start],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) }
  );

  const x = interpolate(inSpring, [0, 1], [120, 0]) + slideOut * 120;
  const opacity = interpolate(inSpring, [0, 1], [0, 1]) * (1 - slideOut);

  return (
    <div
      style={{
        position: "absolute",
        top: (canvasBox.top + canvasBox.bottom) / 2 - 80,
        right: 28,
        transform: `translateX(${x}px)`,
        opacity,
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
        border: "2px solid #FBBF24",
        borderRadius: 16,
        padding: "16px 22px",
        boxShadow: "0 14px 36px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
        zIndex: 55,
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 14,
          color: "#FBBF24",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        ⏭ Coming up
      </div>
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 30,
          color: "#FFFFFF",
          lineHeight: 1.05,
          letterSpacing: "-0.005em",
        }}
      >
        {next.title}
      </div>
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 18,
          color: "#A7F3D0",
          lineHeight: 1.2,
        }}
      >
        {next.subtitle}
      </div>
    </div>
  );
};
