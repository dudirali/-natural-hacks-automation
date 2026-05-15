import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { z } from "zod";
import { CaptionsOverlay } from "./components/CaptionsOverlay";

export const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export const longSchema = z.object({
  /** Single pre-stitched video file (B-roll + narration + music baked in by FFmpeg) */
  videoFile: z.string(),
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
 * Lightweight composition: one OffthreadVideo source (FFmpeg-stitched B-roll
 * with audio baked in) + a captions overlay. This avoids the 38-source memory
 * issue that crashed Chromium on Railway.
 */
export const Long: React.FC<LongProps> = ({ videoFile, words }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={staticFile(videoFile)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />

      {/* Vignette at bottom for caption legibility */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 65%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Captions overlay using global word timings */}
      <CaptionsOverlay words={words} />
    </AbsoluteFill>
  );
};
