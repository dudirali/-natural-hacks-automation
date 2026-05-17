import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { CaptionsOverlay } from "./components/CaptionsOverlay";
import { SubscribePopup } from "./components/SubscribePopup";
import { EndScreen } from "./components/EndScreen";
import { AnimationDispatcher, animationSchema } from "./components/animations";

export const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export const longSchema = z.object({
  /** Single pre-stitched video file — referenced only for prop compatibility; not used. */
  videoFile: z.string().optional(),
  /** Global word timestamps across the entire stitched video */
  words: z.array(wordSchema),
  fps: z.number(),
  durationFrames: z.number(),
  totalSeconds: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  /** Animations / infographics that fully replace B-roll during their window. */
  animations: z.array(animationSchema).optional(),
});

export type LongProps = z.infer<typeof longSchema>;

export const DEFAULT_PROPS: LongProps = {
  videoFile: "stitched-broll.mp4",
  words: [],
  fps: 30,
  durationFrames: 90,
  totalSeconds: 3,
  width: 1280,
  height: 720,
};

/**
 * Captions-only overlay rendered against a chroma-key background (magenta
 * #FF00FF). FFmpeg removes the magenta to transparency via the colorkey
 * filter, then overlays onto the stitched B-roll. We use chroma-key rather
 * than alpha-WebM because VP8/VP9 alpha encoding via Remotion CLI silently
 * dropped the alpha channel to yuv420p on Railway.
 *
 * Pure magenta is safe: captions are white/yellow text on near-black pill,
 * vignette is grayscale gradient → no risk of color collision.
 */
const CHROMA = "#FF00FF";

export const Long: React.FC<LongProps> = ({ words, totalSeconds, animations }) => {
  const total = totalSeconds ?? 300;
  return (
    <AbsoluteFill style={{ backgroundColor: CHROMA }}>
      {/* B-roll vignette (only visible when no animation is playing — animations
          have opaque backgrounds and cover the magenta + vignette). */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 65%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Animations replace B-roll during their windows (opaque backgrounds).
          Placed BEFORE captions so captions sit on top when both visible. */}
      <AnimationDispatcher animations={animations ?? []} />

      <CaptionsOverlay words={words} />

      {/* Subscribe popup at 28s — only renders if not in an animation window. */}
      <ConditionalOverlay animations={animations ?? []}>
        <SubscribePopup appearAt={28} duration={5} />
      </ConditionalOverlay>

      <EndScreen totalSeconds={total} windowSeconds={8} />
    </AbsoluteFill>
  );
};

/** Hides children when an animation is currently on screen (so popups
 *  don't appear over our full-screen infographics). */
const ConditionalOverlay: React.FC<{
  animations: Array<{ start: number; duration: number }>;
  children: React.ReactNode;
}> = ({ animations, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const isAnimating = animations.some((a) => t >= a.start && t < a.start + a.duration);
  if (isAnimating) return null;
  return <>{children}</>;
};
