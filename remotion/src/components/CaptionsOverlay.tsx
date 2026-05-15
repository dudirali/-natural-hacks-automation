import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont();

interface Word {
  word: string;
  start: number;
  end: number;
}

interface Chunk {
  text: string;
  words: Word[];
  start: number;
  end: number;
}

interface Props {
  words: Word[];
}

// 16:9 long-form: roomier chunks (5-6 words), bottom-center placement, smaller font,
// subtle pop-in (no rotation — calm wellness vibe, not viral shorts energy).
const MAX_WORDS_PER_CHUNK = 6;

function groupIntoChunks(words: Word[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (!current.length) return;
    chunks.push({
      text: current.map((w) => w.word).join(" "),
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end,
    });
    current = [];
  };
  for (const w of words) {
    current.push(w);
    const endsWithStrongPunct = /[.!?]$/.test(w.word);
    if (endsWithStrongPunct || current.length >= MAX_WORDS_PER_CHUNK) flush();
  }
  flush();
  for (let i = 0; i < chunks.length - 1; i++) chunks[i].end = chunks[i + 1].start;
  return chunks;
}

export const CaptionsOverlay: React.FC<Props> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const chunks = useMemo(() => groupIntoChunks(words), [words]);
  const active = chunks.find((c) => t >= c.start && t < c.end);
  if (!active) return null;

  const chunkLocalFrame = Math.max(0, frame - Math.floor(active.start * fps));
  const popIn = spring({
    frame: chunkLocalFrame,
    fps,
    config: { damping: 18, stiffness: 180, mass: 0.5 },
  });
  const opacity = interpolate(popIn, [0, 1], [0, 1]);
  const translateY = interpolate(popIn, [0, 1], [10, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "9%", // safe above YT progress bar / UI
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          textAlign: "center",
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontFamily,
            fontSize: 42, // scaled for 720p (was 64 at 1080p)
            fontWeight: 800,
            lineHeight: 1.15,
            color: "#FFFFFF",
            letterSpacing: "0.005em",
            padding: "10px 22px",
            background: "rgba(0,0,0,0.55)",
            borderRadius: 10,
            textShadow: "0 4px 16px rgba(0,0,0,0.7)",
            WebkitTextStroke: "1px rgba(0,0,0,0.4)",
          }}
        >
          {active.words.map((w, i) => {
            const isActive = t >= w.start && t < w.end;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  margin: "0 0.18em",
                  color: isActive ? "#FFD60A" : "#FFFFFF",
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
