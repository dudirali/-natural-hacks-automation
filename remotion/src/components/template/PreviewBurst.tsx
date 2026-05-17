import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing, AbsoluteFill } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import type { Section } from "./SectionBadge";

const { fontFamily } = loadFont();

interface Props {
  /** Hook text shown big in the burst (typically videoTitle or thumbnail_hook). */
  hook: string;
  /** Sections — first 4 titles are flashed in quick succession. */
  sections: Section[];
  /** Total seconds the burst lasts. Default 2.6s. */
  duration?: number;
}

const ACCENT = "#FBBF24";   // amber
const BG_DARK = "#0F172A";
const TEXT_WHITE = "#FFFFFF";

/**
 * 2.5-second opening burst that PROMISES what's coming.
 *
 * Three phases (default 2.6s total):
 *   0.0–1.2s   Big TODAY title with the hook → "1 IN 3 ADULTS DON'T KNOW"
 *              massive type + colored bar + pulse
 *   1.2–2.3s   Rapid-fire section title cards (3-4) — one every 0.3s
 *              "SIGN 1 → Brittle Fingernails", "SIGN 2 → ...", etc.
 *   2.3–2.6s   Fade-out reveal of the normal template underneath
 *
 * Stays opaque the entire time, hiding the canvas/circle/captions. Audio
 * keeps playing underneath (HeyGen's hook narration) — so the burst is a
 * VISUAL companion to the spoken hook.
 */
export const PreviewBurst: React.FC<Props> = ({ hook, sections, duration = 2.6 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t >= duration) return null;

  // Phase 1: big title (0 - 1.2s)
  const titlePop = spring({ frame, fps, config: { damping: 13, stiffness: 110 } });
  const titleScale = interpolate(titlePop, [0, 1], [0.5, 1]);
  const titleOpacity = interpolate(t, [0, 0.4, 1.0, 1.4], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Phase 2: section flash cards (1.2 - 2.3s)
  const flashCards = sections.slice(0, 4);
  const cardStart = 1.2;
  const perCard = 0.28;

  // Phase 3: fade-out (2.3 - 2.6s)
  const fadeOut = interpolate(t, [duration - 0.3, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const overallOpacity = 1 - fadeOut;

  return (
    <AbsoluteFill
      style={{
        background:
          `radial-gradient(ellipse at top, #1E293B 0%, ${BG_DARK} 65%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 60,
        opacity: overallOpacity,
        zIndex: 70, // above everything in the canvas band
      }}
    >
      {/* Phase 1: TODAY + hook */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `scale(${titleScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 32,
            color: ACCENT,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          ⏵ Today
        </div>
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 84,
            color: TEXT_WHITE,
            letterSpacing: "-0.02em",
            lineHeight: 0.95,
            textAlign: "center",
            maxWidth: "90%",
            textShadow: "0 8px 28px rgba(0,0,0,0.65)",
          }}
        >
          {hook.toUpperCase()}
        </div>
        <div
          style={{
            width: 280,
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
            marginTop: 10,
          }}
        />
      </div>

      {/* Phase 2: rapid flash cards — absolutely positioned, each fades in/out */}
      {flashCards.length > 0 &&
        flashCards.map((s, i) => {
          const cardT = cardStart + i * perCard;
          if (t < cardT || t > cardT + perCard + 0.15) return null;
          const localT = t - cardT;
          const alpha = interpolate(localT, [0, 0.08, perCard, perCard + 0.15], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const scl = interpolate(localT, [0, 0.1], [0.85, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={s.id}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: alpha,
                transform: `scale(${scl})`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  background: "rgba(15,23,42,0.9)",
                  border: `3px solid ${ACCENT}`,
                  borderRadius: 18,
                  padding: "26px 44px",
                  boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
                }}
              >
                <div
                  style={{
                    fontFamily,
                    fontWeight: 900,
                    fontSize: 60,
                    color: ACCENT,
                    letterSpacing: "0.04em",
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    fontFamily,
                    fontWeight: 800,
                    fontSize: 36,
                    color: TEXT_WHITE,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {s.subtitle}
                </div>
              </div>
            </div>
          );
        })}
    </AbsoluteFill>
  );
};
