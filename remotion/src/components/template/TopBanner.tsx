import React from "react";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

interface Props {
  /** Short ALL-CAPS title — typically the thumbnail hook. */
  title: string;
}

const HEIGHT = 72;

/**
 * Permanent top strip — fixed-template branding banner.
 * Light green → light blue gradient, big bold white title centred.
 */
export const TopBanner: React.FC<Props> = ({ title }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: HEIGHT,
        background:
          "linear-gradient(90deg, #4ADE80 0%, #22D3EE 50%, #38BDF8 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
        zIndex: 100,
      }}
    >
      <div
        style={{
          fontFamily,
          fontWeight: 900,
          // Auto-scale: longer titles use smaller font so the whole line fits.
          fontSize: title.length > 55 ? 28 : title.length > 42 ? 34 : title.length > 30 ? 40 : 46,
          color: "#FFFFFF",
          letterSpacing: "0.01em",
          textShadow: "0 2px 6px rgba(0,0,0,0.35)",
          textAlign: "center",
          padding: "0 24px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "98%",
        }}
      >
        {title.toUpperCase()}
      </div>
    </div>
  );
};

export const TOP_BANNER_HEIGHT = HEIGHT;
