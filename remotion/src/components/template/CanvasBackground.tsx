import React from "react";

interface Props {
  top: number;
  bottom: number;
}

/**
 * Fixed-template canvas — fills the area between the top and bottom banners.
 * Soft white-to-mint gradient with a subtle dot pattern overlay for "clean
 * paper" feel. Opaque so it covers the underlying stitched B-roll except
 * inside the CircleMask which punches a transparent hole.
 */
export const CanvasBackground: React.FC<Props> = ({ top, bottom }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        bottom,
        // Layered: base gradient + subtle radial light + dot pattern.
        background: [
          "radial-gradient(circle at 30% 40%, rgba(74,222,128,0.10) 0%, transparent 50%)",
          "radial-gradient(circle at 80% 70%, rgba(56,189,248,0.08) 0%, transparent 55%)",
          // SVG dot pattern, low opacity, scattered
          `url("data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><circle cx='10' cy='10' r='1' fill='%23A7F3D0'/><circle cx='30' cy='30' r='1' fill='%2399F6E4'/></svg>`
          )}")`,
          "linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 45%, #ECFEFF 100%)",
        ].join(", "),
      }}
    />
  );
};
