import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

export interface Section {
  id: number;
  title: string;
  subtitle: string;
  start: number;
  end: number;
}

interface Props {
  sections: Section[];
  /** Top edge — defaults to right under the top banner. */
  top?: number;
}

/**
 * Badge in the top-right of the canvas: "SIGN 2 OF 5".
 * Updates with a pop-in spring whenever we cross a section boundary, so
 * the viewer is always oriented on where they are in the list.
 */
export const SectionBadge: React.FC<Props> = ({ sections, top = 84 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (!sections.length) return null;

  const active = sections.find((s) => t >= s.start && t < s.end);
  if (!active) return null;

  // Pop-in animation when section starts
  const localFrame = Math.max(0, frame - Math.floor(active.start * fps));
  const popIn = spring({ frame: localFrame, fps, config: { damping: 15, stiffness: 130 } });
  const scale = interpolate(popIn, [0, 1], [0.5, 1]);
  const opacity = interpolate(popIn, [0, 1], [0, 1]);

  return (
    <div
      style={{
        position: "absolute",
        top,
        right: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "top right",
        zIndex: 60,
      }}
    >
      {/* Main badge: "SIGN 2 OF 5" */}
      <div
        style={{
          background: "linear-gradient(135deg, #F87171 0%, #FB923C 100%)",
          color: "#FFFFFF",
          fontFamily,
          fontWeight: 900,
          fontSize: 26,
          letterSpacing: "0.05em",
          padding: "8px 18px 6px",
          borderRadius: 8,
          boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
        }}
      >
        {active.title} OF {sections.length}
      </div>
      {/* Subtitle below in calmer style */}
      <div
        style={{
          background: "rgba(15,25,35,0.85)",
          color: "#FCD34D",
          fontFamily,
          fontWeight: 800,
          fontSize: 18,
          padding: "5px 14px",
          borderRadius: 6,
          maxWidth: 280,
          textAlign: "right",
        }}
      >
        {active.subtitle}
      </div>
    </div>
  );
};
