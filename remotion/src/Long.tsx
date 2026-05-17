import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { CanvasCaptions } from "./components/template/CanvasCaptions";
import { TopBanner, TOP_BANNER_HEIGHT } from "./components/template/TopBanner";
import { BottomBanner, BOTTOM_BANNER_HEIGHT } from "./components/template/BottomBanner";
import { CanvasBackground } from "./components/template/CanvasBackground";
import { CircleMask } from "./components/template/CircleMask";
import { CanvasDecorations } from "./components/template/CanvasDecorations";
import { SubscribePopup } from "./components/SubscribePopup";
import { EndScreen } from "./components/EndScreen";
import { AnimationDispatcher, animationSchema } from "./components/animations";

export const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export const longSchema = z.object({
  videoFile: z.string().optional(),
  words: z.array(wordSchema),
  fps: z.number(),
  durationFrames: z.number(),
  totalSeconds: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  animations: z.array(animationSchema).optional(),
  /** Title shown in the permanent top banner (typically `thumbnail_hook`). */
  videoTitle: z.string().optional(),
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
  animations: [],
  videoTitle: "7 SILENT SIGNS",
};

const CHROMA = "#FF00FF";

// Layout constants
const WIDTH = 1280;
const HEIGHT = 720;
const CANVAS_TOP = TOP_BANNER_HEIGHT;
const CANVAS_BOTTOM = HEIGHT - BOTTOM_BANNER_HEIGHT;
// Enlarged circle for B-roll. Matches PASS 1's crop+pad (520x520 placed at
// x=20, y=100 in stitched-broll.mp4) so the subject lands centered.
const CIRCLE_R = 260;
const CIRCLE_CX = 280;
const CIRCLE_CY = (CANVAS_TOP + CANVAS_BOTTOM) / 2;
// Captions box on the right of the canvas (shifted right to clear the larger circle)
const CAPTIONS_BOX = {
  left: CIRCLE_CX + CIRCLE_R + 40,
  top: CANVAS_TOP + 140, // leaves room for the big chunk-emoji card above
  right: WIDTH - 40,
  bottom: CANVAS_BOTTOM - 40,
};
const CANVAS_BOX = {
  left: 0,
  top: CANVAS_TOP,
  right: WIDTH,
  bottom: CANVAS_BOTTOM,
};

/**
 * Fixed-template composition.
 * Layers (back→front):
 *   1. Full-frame chroma fill (becomes transparent everywhere we don't paint).
 *   2. Opaque canvas background (white→mint gradient + soft pattern).
 *   3. CircleMask: paints magenta inside a circle on the left → chroma-key
 *      removes it at composite time, letting the stitched B-roll show through.
 *   4. CanvasCaptions on the right.
 *   5. AnimationDispatcher — when an animation is active, it fills the entire
 *      canvas area (between the banners) with an opaque infographic that
 *      covers both the circle and captions.
 *   6. TopBanner + BottomBanner — always visible, top z-order.
 *   7. SubscribePopup at 28s (hidden when an animation is on screen).
 *   8. EndScreen in the last 8s.
 */
export const Long: React.FC<LongProps> = ({ words, totalSeconds, animations, videoTitle }) => {
  const total = totalSeconds ?? 300;
  const title = videoTitle ?? "@naturalhacks";

  return (
    <AbsoluteFill style={{ backgroundColor: CHROMA }}>
      {/* 2: Opaque canvas covers the middle region only */}
      <CanvasBackground top={CANVAS_TOP} bottom={BOTTOM_BANNER_HEIGHT} />

      {/* 3: Circular chroma porthole on the left for B-roll */}
      <CircleMask cx={CIRCLE_CX} cy={CIRCLE_CY} r={CIRCLE_R} />

      {/* 3b: Always-present canvas decorations + per-chunk big icon card */}
      <CanvasDecorations words={words} captionBox={CAPTIONS_BOX} canvasBox={CANVAS_BOX} />

      {/* 4: Captions on the right side of canvas (black text) */}
      <CanvasCaptions words={words} box={CAPTIONS_BOX} />

      {/* 5: Animations cover the canvas area when active.
              Constrained between the banners so the branding stays visible. */}
      <CanvasAnimations
        animations={animations ?? []}
        top={CANVAS_TOP}
        bottom={BOTTOM_BANNER_HEIGHT}
      />

      {/* 6: Permanent banners */}
      <TopBanner title={title} />
      <BottomBanner />

      {/* 7+8: Popups — hidden during animations */}
      <ConditionalOverlay animations={animations ?? []}>
        <SubscribePopup appearAt={28} duration={5} />
      </ConditionalOverlay>
      <EndScreen totalSeconds={total} windowSeconds={8} />
    </AbsoluteFill>
  );
};

/** Renders the AnimationDispatcher constrained to a vertical band between
 *  the top and bottom banners (so the banners stay visible above/below). */
const CanvasAnimations: React.FC<{
  animations: Array<{ start: number; duration: number }>;
  top: number;
  bottom: number;
}> = ({ animations, top, bottom }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const isAnimating = animations.some((a) => t >= a.start && t < a.start + a.duration);
  if (!isAnimating) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        bottom,
        overflow: "hidden",
      }}
    >
      <AnimationDispatcher animations={animations as any} />
    </div>
  );
};

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
