import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface Props {
  /** Total length in seconds (drives the fill percentage). */
  totalSeconds: number;
  /** Vertical position — defaults sit just above the bottom banner. */
  bottom?: number;
}

/**
 * Always-visible progress bar at the bottom of the canvas. Fills from
 * 0% to 100% over the video. Subtle but persistent — gives the viewer
 * a constant signal that the video is moving forward, fighting the
 * urge to drop off.
 */
export const ProgressBar: React.FC<Props> = ({ totalSeconds, bottom = 74 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pct = Math.max(0, Math.min(1, t / totalSeconds));
  // Soft gradient: emerald → cyan, with a glow.
  return (
    <>
      {/* Track */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom,
          height: 5,
          background: "rgba(15,25,35,0.10)",
          zIndex: 50,
        }}
      />
      {/* Fill */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom,
          height: 5,
          width: `${pct * 100}%`,
          background: "linear-gradient(90deg, #34D399 0%, #22D3EE 60%, #38BDF8 100%)",
          boxShadow: "0 0 8px rgba(52,211,153,0.7)",
          zIndex: 50,
          transition: "none",
        }}
      />
      {/* Head dot */}
      <div
        style={{
          position: "absolute",
          left: `${pct * 100}%`,
          bottom: bottom - 4,
          width: 14,
          height: 14,
          marginLeft: -7,
          borderRadius: "50%",
          background: "#FFFFFF",
          border: "2px solid #34D399",
          boxShadow: "0 0 10px rgba(52,211,153,0.9)",
          zIndex: 51,
        }}
      />
    </>
  );
};
