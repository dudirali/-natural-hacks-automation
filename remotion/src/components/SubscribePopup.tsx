import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

interface Props {
  /** Time (seconds) at which the popup appears. */
  appearAt?: number;
  /** Duration (seconds) the popup stays on screen. */
  duration?: number;
}

/**
 * Animated subscribe popup. Slides in from the right at `appearAt` seconds,
 * stays visible for `duration`, then slides out. Use early in the video
 * (around 25-35s) to catch new viewers while they're still engaged.
 */
export const SubscribePopup: React.FC<Props> = ({ appearAt = 28, duration = 5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < appearAt - 0.5 || t > appearAt + duration + 0.5) return null;

  // Slide-in spring from appearAt; slide-out by simple ease near end.
  const localFrame = Math.max(0, frame - Math.floor(appearAt * fps));
  const slideIn = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.7 },
  });
  const outStart = appearAt + duration;
  const outProgress = interpolate(t, [outStart, outStart + 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const x = interpolate(slideIn, [0, 1], [400, 0]) + outProgress * 400;
  const opacity = interpolate(slideIn, [0, 1], [0, 1]) * (1 - outProgress);

  // Pulse on the button to draw the eye.
  const pulse = 1 + 0.04 * Math.sin(t * Math.PI * 2.5);

  return (
    <div
      style={{
        position: "absolute",
        right: 30,
        bottom: 110,
        transform: `translateX(${x}px)`,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 14,
        backgroundColor: "rgba(10,14,26,0.92)",
        borderRadius: 14,
        padding: "12px 18px",
        boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          backgroundColor: "#FF3D3D",
          color: "#FFFFFF",
          fontFamily,
          fontWeight: 900,
          fontSize: 22,
          padding: "8px 18px",
          borderRadius: 8,
          letterSpacing: "0.05em",
          transform: `scale(${pulse})`,
        }}
      >
        SUBSCRIBE
      </div>
      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 18,
          color: "#FFFFFF",
          lineHeight: 1.15,
        }}
      >
        for more
        <br />
        natural hacks
      </div>
    </div>
  );
};
