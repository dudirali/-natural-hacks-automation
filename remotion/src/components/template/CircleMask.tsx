import React from "react";

interface Props {
  cx: number;
  cy: number;
  r: number;
  /** Magenta — gets chroma-keyed to transparent by FFmpeg, revealing the
   *  stitched B-roll video underneath. */
  chromaColor?: string;
}

/**
 * Circular "porthole" on the canvas where the stitched B-roll shows through.
 * Implemented as a magenta-filled circle on top of the opaque canvas — after
 * the chroma-key step the magenta becomes transparent → B-roll visible only
 * inside this circle.
 *
 * A subtle white ring + drop shadow sits OUTSIDE the chroma area so the
 * circle reads as a designed element on the canvas.
 */
export const CircleMask: React.FC<Props> = ({ cx, cy, r, chromaColor = "#FF00FF" }) => {
  const size = r * 2;
  return (
    <>
      {/* Outer decorative ring with soft shadow (white, not chroma) */}
      <div
        style={{
          position: "absolute",
          left: cx - r - 6,
          top: cy - r - 6,
          width: size + 12,
          height: size + 12,
          borderRadius: "50%",
          background: "#FFFFFF",
          boxShadow:
            "0 18px 40px rgba(15,25,35,0.22), 0 6px 14px rgba(15,25,35,0.12)",
        }}
      />
      {/* Inner chroma fill — becomes transparent at composite time */}
      <div
        style={{
          position: "absolute",
          left: cx - r,
          top: cy - r,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: chromaColor,
        }}
      />
    </>
  );
};
