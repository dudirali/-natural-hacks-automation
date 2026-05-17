import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

interface Props {
  /** Total length of the video in seconds. End screen starts 8s before this. */
  totalSeconds: number;
  /** End-screen window length in seconds (default 8s). */
  windowSeconds?: number;
}

/**
 * End-screen overlay. Becomes visible 8s before the video ends.
 * Shows a big "SUBSCRIBE" CTA + channel handle. The B-roll continues to play
 * behind it (with a darkening overlay), so the viewer still has motion to
 * watch while we ask for the subscribe.
 */
export const EndScreen: React.FC<Props> = ({ totalSeconds, windowSeconds = 8 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const startAt = totalSeconds - windowSeconds;
  if (t < startAt - 0.4) return null;

  const localFrame = Math.max(0, frame - Math.floor(startAt * fps));
  const inSpring = spring({
    frame: localFrame,
    fps,
    config: { damping: 16, stiffness: 110, mass: 0.7 },
  });
  const opacity = interpolate(inSpring, [0, 1], [0, 1]);
  const scale = interpolate(inSpring, [0, 1], [0.85, 1]);

  // Subtle CTA pulse to attract clicks.
  const pulse = 1 + 0.03 * Math.sin(t * Math.PI * 2.5);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "rgba(10,14,26,0.75)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        opacity,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          fontSize: 64,
          color: "#FFFFFF",
          textShadow: "0 4px 16px rgba(0,0,0,0.7)",
          letterSpacing: "-0.01em",
          transform: `scale(${scale})`,
        }}
      >
        Thanks for watching!
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          transform: `scale(${scale * pulse})`,
        }}
      >
        <div
          style={{
            backgroundColor: "#FF3D3D",
            color: "#FFFFFF",
            fontFamily,
            fontWeight: 900,
            fontSize: 56,
            padding: "20px 46px 16px",
            borderRadius: 14,
            letterSpacing: "0.04em",
            boxShadow: "0 14px 40px rgba(0,0,0,0.55)",
          }}
        >
          SUBSCRIBE
        </div>
      </div>

      <div
        style={{
          fontFamily,
          fontWeight: 700,
          fontSize: 36,
          color: "#FFD60A",
          letterSpacing: "0.06em",
          textShadow: "0 3px 10px rgba(0,0,0,0.7)",
          transform: `scale(${scale})`,
        }}
      >
        @naturalhacks_official
      </div>

      <div
        style={{
          fontFamily,
          fontWeight: 500,
          fontSize: 22,
          color: "rgba(255,255,255,0.8)",
          letterSpacing: "0.05em",
          marginTop: 6,
          transform: `scale(${scale})`,
        }}
      >
        New natural-health videos every day
      </div>
    </div>
  );
};
