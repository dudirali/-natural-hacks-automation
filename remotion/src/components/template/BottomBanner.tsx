import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

const HEIGHT = 72;

/**
 * Permanent bottom strip — engagement CTA.
 * Same green→blue gradient. Three icons (LIKE / SUBSCRIBE / COMMENT) take
 * turns pulsing every ~2 seconds to draw eye attention without being noisy.
 */
export const BottomBanner: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // Pulse cycle: 3 icons, each gets 2s of "spotlight" in rotation (6s loop).
  const cycle = t % 6;
  const likePulse = pulse(cycle, 0);
  const subPulse = pulse(cycle, 2);
  const commPulse = pulse(cycle, 4);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: HEIGHT,
        background:
          "linear-gradient(90deg, #38BDF8 0%, #22D3EE 50%, #4ADE80 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 60,
        boxShadow: "0 -4px 12px rgba(0,0,0,0.18)",
        zIndex: 100,
      }}
    >
      <Cta label="LIKE" scale={likePulse} icon={<LikeIcon />} />
      <Cta label="SUBSCRIBE" scale={subPulse} icon={<BellIcon />} highlight />
      <Cta label="COMMENT" scale={commPulse} icon={<CommentIcon />} />
    </div>
  );
};

function pulse(t: number, peakAt: number): number {
  // Returns a value between 1.0 (rest) and 1.18 (peak) over a 0.7s window.
  const window = 0.7;
  const d = t - peakAt;
  if (d < -window / 2 || d > window / 2) return 1;
  const norm = (d + window / 2) / window;
  return 1 + 0.18 * Math.sin(norm * Math.PI);
}

const Cta: React.FC<{ label: string; icon: React.ReactNode; scale: number; highlight?: boolean }> = ({
  label,
  icon,
  scale,
  highlight,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      transform: `scale(${scale})`,
    }}
  >
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: highlight ? 10 : 23,
        background: highlight ? "#FF3D3D" : "rgba(255,255,255,0.95)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      }}
    >
      {icon}
    </div>
    <span
      style={{
        fontFamily,
        fontWeight: 900,
        fontSize: 22,
        color: "#FFFFFF",
        letterSpacing: "0.04em",
        textShadow: "0 2px 5px rgba(0,0,0,0.35)",
      }}
    >
      {label}
    </span>
  </div>
);

const LikeIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="#0F1923">
    <path d="M2 21h4V9H2v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
  </svg>
);

const BellIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="#FFFFFF">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
  </svg>
);

const CommentIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="#0F1923">
    <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z"/>
  </svg>
);

export const BOTTOM_BANNER_HEIGHT = HEIGHT;
