import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

export const thumbnailSchema = z.object({
  /** Filename of the hero image inside public/ (1280x720 jpg/png). */
  heroImage: z.string(),
  /** Short ALL-CAPS hook (3-6 words). */
  hook: z.string(),
  /** One word/number from `hook` that should be tinted (rendered in accent color). */
  accent: z.string(),
});

export type ThumbnailProps = z.infer<typeof thumbnailSchema>;

export const DEFAULT_THUMBNAIL_PROPS: ThumbnailProps = {
  heroImage: "thumbnail-hero.jpg",
  hook: "7 SILENT SIGNS",
  accent: "7",
};

// Wellness palette — warm gold for accent, deep teal as fallback.
const ACCENT_GOLD = "#FFB935";
const TEXT_WHITE = "#FFFFFF";
const STROKE_BLACK = "#000000";

export const Thumbnail: React.FC<ThumbnailProps> = ({ heroImage, hook, accent }) => {
  // Split the hook into runs, marking the accent word(s) for color tint.
  const runs = splitHookByAccent(hook, accent);
  // Adapt font size so longer hooks still fit comfortably.
  const charCount = hook.length;
  const titleSize = charCount > 22 ? 110 : charCount > 14 ? 140 : 170;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Hero image */}
      <Img
        src={staticFile(heroImage)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />

      {/* Strong dark vignette so white title pops on any image */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.0) 25%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Left-side dark blanket for title legibility */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.40) 35%, rgba(0,0,0,0.0) 60%)",
        }}
      />

      {/* Channel watermark, top-right */}
      <div
        style={{
          position: "absolute",
          top: 28,
          right: 38,
          fontFamily,
          fontWeight: 700,
          fontSize: 28,
          color: "rgba(255,255,255,0.88)",
          textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          letterSpacing: "0.05em",
        }}
      >
        @naturalhacks
      </div>

      {/* Title block bottom-left */}
      <div
        style={{
          position: "absolute",
          left: 54,
          right: 54,
          bottom: 64,
          fontFamily,
          fontWeight: 900,
          fontSize: titleSize,
          lineHeight: 0.95,
          letterSpacing: "-0.01em",
          color: TEXT_WHITE,
          // Heavy multi-layer stroke for legibility on any background.
          textShadow: [
            "-4px -4px 0 " + STROKE_BLACK,
            " 4px -4px 0 " + STROKE_BLACK,
            "-4px  4px 0 " + STROKE_BLACK,
            " 4px  4px 0 " + STROKE_BLACK,
            "0 6px 24px rgba(0,0,0,0.75)",
          ].join(", "),
        }}
      >
        {runs.map((r, i) => (
          <span
            key={i}
            style={{ color: r.isAccent ? ACCENT_GOLD : TEXT_WHITE }}
          >
            {r.text}
            {i < runs.length - 1 ? " " : ""}
          </span>
        ))}
      </div>

      {/* Subtle accent bar under the title block */}
      <div
        style={{
          position: "absolute",
          left: 54,
          bottom: 40,
          width: 240,
          height: 8,
          backgroundColor: ACCENT_GOLD,
          borderRadius: 4,
        }}
      />
    </AbsoluteFill>
  );
};

function splitHookByAccent(hook: string, accent: string): Array<{ text: string; isAccent: boolean }> {
  if (!accent) return [{ text: hook, isAccent: false }];
  const accentUpper = accent.toUpperCase().trim();
  const words = hook.split(/\s+/);
  return words.map((w) => ({
    text: w,
    // Match either exact equality or accent contained in the word (e.g. "7" matches "7" but not "70"; "BANANA" matches "BANANA").
    isAccent: w.toUpperCase().replace(/[^A-Z0-9]/g, "") ===
              accentUpper.replace(/[^A-Z0-9]/g, ""),
  }));
}
