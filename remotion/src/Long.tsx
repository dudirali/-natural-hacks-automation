import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
} from "remotion";
import { z } from "zod";
import { CaptionsOverlay } from "./components/CaptionsOverlay";

export const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export const segmentSchema = z.object({
  id: z.number(),
  role: z.string(),
  text: z.string(),
  duration_seconds: z.number(),
  audioFile: z.string(),
  videoFile: z.string(),
  words: z.array(wordSchema),
  audioDuration: z.number(),
});

export const longSchema = z.object({
  segments: z.array(segmentSchema),
  musicFile: z.string().nullable().optional(),
  musicVolume: z.number().optional(),
  fps: z.number(),
  durationFrames: z.number(),
  totalSeconds: z.number().optional(),
});

export type LongProps = z.infer<typeof longSchema>;

export const DEFAULT_PROPS: LongProps = {
  segments: [],
  musicFile: null,
  musicVolume: 0.05,
  fps: 30,
  durationFrames: 90,
  totalSeconds: 3,
};

export const Long: React.FC<LongProps> = ({
  segments,
  musicFile,
  musicVolume = 0.05,
  fps,
}) => {
  let cumulativeFrames = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Per-segment B-roll + per-segment narration. Each segment is one Sequence. */}
      {segments.map((s) => {
        const fromFrame = cumulativeFrames;
        const durationInFrames = Math.max(1, Math.round(s.duration_seconds * fps));
        cumulativeFrames += durationInFrames;
        return (
          <Sequence key={s.id} from={fromFrame} durationInFrames={durationInFrames}>
            <AbsoluteFill>
              <OffthreadVideo
                src={staticFile(s.videoFile)}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <Audio src={staticFile(s.audioFile)} />
              <CaptionsOverlay words={s.words} />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Top-level subtle vignette at bottom for caption legibility on any background */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 65%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Background music (very low volume — narrator is the focus) */}
      {musicFile ? <Audio src={staticFile(musicFile)} volume={musicVolume} /> : null}
    </AbsoluteFill>
  );
};
