import React from "react";
import { spring, interpolate, AbsoluteFill, Easing } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { PALETTE } from "./types";

const { fontFamily } = loadFont();

interface Step {
  title: string;
  desc?: string;
}

interface Props {
  title?: string;
  steps: Step[];
  localFrame: number;
  fps: number;
  duration: number;
}

/** Step-by-step process card: "Step 1 → Step 2 → Step 3" with arrows. */
export const ProcessStepsAnim: React.FC<Props> = ({ title, steps, localFrame, fps, duration }) => {
  const titleIn = spring({ frame: localFrame, fps, config: { damping: 18, stiffness: 140 } });
  const totalFrames = duration * fps;
  const outFade = 1 - interpolate(localFrame, [totalFrames - 12, totalFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  // Each step reveals 0.8s apart
  const perStep = Math.max(12, Math.floor((totalFrames - 36) / steps.length));

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${PALETTE.bgDark} 0%, ${PALETTE.bgPanel} 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 60,
        gap: 40,
        opacity: outFade,
      }}
    >
      {title && (
        <div
          style={{
            fontFamily,
            fontWeight: 900,
            fontSize: 54,
            color: PALETTE.accentYellow,
            letterSpacing: "-0.01em",
            opacity: interpolate(titleIn, [0, 1], [0, 1]),
            transform: `translateY(${interpolate(titleIn, [0, 1], [-15, 0])}px)`,
          }}
        >
          {title.toUpperCase()}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 30 }}>
        {steps.map((step, i) => {
          const stepIn = spring({ frame: localFrame - 18 - i * perStep, fps, config: { damping: 14, stiffness: 120 } });
          if (stepIn === 0) return null;
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  width: 260,
                  opacity: interpolate(stepIn, [0, 1], [0, 1]),
                  transform: `translateY(${interpolate(stepIn, [0, 1], [20, 0])}px) scale(${interpolate(stepIn, [0, 1], [0.85, 1])})`,
                }}
              >
                {/* Number circle */}
                <div
                  style={{
                    width: 90,
                    height: 90,
                    borderRadius: "50%",
                    background: PALETTE.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily,
                    fontWeight: 900,
                    fontSize: 48,
                    color: PALETTE.bgDark,
                    boxShadow: `0 6px 20px rgba(52,211,153,0.5)`,
                  }}
                >
                  {i + 1}
                </div>
                {/* Title */}
                <div
                  style={{
                    fontFamily,
                    fontWeight: 800,
                    fontSize: 28,
                    color: PALETTE.textWhite,
                    textAlign: "center",
                    lineHeight: 1.15,
                  }}
                >
                  {step.title}
                </div>
                {step.desc && (
                  <div
                    style={{
                      fontFamily,
                      fontWeight: 500,
                      fontSize: 18,
                      color: PALETTE.textMuted,
                      textAlign: "center",
                      lineHeight: 1.3,
                    }}
                  >
                    {step.desc}
                  </div>
                )}
              </div>
              {/* Arrow between steps */}
              {i < steps.length - 1 && (
                <div
                  style={{
                    fontSize: 60,
                    color: PALETTE.accentYellow,
                    opacity: interpolate(stepIn, [0, 1], [0, 0.85]),
                    fontWeight: 900,
                  }}
                >
                  →
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
