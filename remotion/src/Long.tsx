import React from "react";
import { AbsoluteFill } from "remotion";
import { z } from "zod";
import { CaptionsOverlay } from "./components/CaptionsOverlay";

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
 * Captions-only overlay rendered to a transparent WebM (VP8 + yuva420p).
 * The B-roll/audio is composited in by FFmpeg afterwards. This avoids
 * Chromium having to seek-extract frames from a long stitched MP4, which
 * caused 120s+ delayRender timeouts via OffthreadVideo on Railway.
 */
export const Long: React.FC<LongProps> = ({ words }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0)" }}>
      {/* Vignette at bottom for caption legibility (semi-transparent — alpha-composited over B-roll) */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 65%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      <CaptionsOverlay words={words} />
    </AbsoluteFill>
  );
};
