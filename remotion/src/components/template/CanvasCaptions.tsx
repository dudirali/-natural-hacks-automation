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
  /** Bounding box of the canvas (where to place text). */
  box: { left: number; top: number; right: number; bottom: number };
}

const MAX_WORDS_PER_CHUNK = 7;
const PAUSE_SPLIT_SECONDS = 0.25;
const MAX_HOLD_PAUSE_SECONDS = 0.2;

// Same emphasis/emoji rules as the dark-bg captions — adapted for light canvas.
const EMPHASIS_RE = /^(\d+%?|\d+(?:st|nd|rd|th)|warning|never|always|secret|hidden|study|research|proven|shocking|dangerous|crucial|critical|deadly|stop|avoid|doctors?|scientists?)[.,!?:;]?$/i;
const EMOJI_MAP: Array<[RegExp, string]> = [
  [/morning|sunrise|wake/i, "☀️"],
  [/sleep|bed|night|tired/i, "😴"],
  [/heart|cardio|pulse/i, "❤️"],
  [/brain|memory|mind/i, "🧠"],
  [/water|hydrat/i, "💧"],
  [/eye|vision|sight/i, "👁️"],
  [/back|spine|posture/i, "🦴"],
  [/stomach|gut|digest|belly/i, "🫁"],
  [/tea|coffee|drink/i, "☕"],
  [/oil|olive|coconut/i, "🫒"],
  [/lemon|citrus/i, "🍋"],
  [/honey|sweet/i, "🍯"],
  [/garlic|onion/i, "🧄"],
  [/ginger|spice|cinnamon/i, "🌿"],
  [/herb|plant|leaf/i, "🌱"],
  [/walk|exercise|move/i, "🚶"],
  [/sun|sunshine|vitamin d/i, "🌞"],
  [/doctor|medical|health/i, "👨‍⚕️"],
  [/warning|danger|stop/i, "⚠️"],
  [/secret|hidden|reveal/i, "🤫"],
];

function emojiFor(text: string): string | null {
  for (const [re, em] of EMOJI_MAP) {
    if (re.test(text)) return em;
  }
  return null;
}

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
    if (current.length > 0) {
      const prevEnd = current[current.length - 1].end;
      if (w.start - prevEnd >= PAUSE_SPLIT_SECONDS) flush();
    }
    current.push(w);
    const endsWithStrongPunct = /[.!?]$/.test(w.word);
    if (endsWithStrongPunct || current.length >= MAX_WORDS_PER_CHUNK) flush();
  }
  flush();
  for (let i = 0; i < chunks.length - 1; i++) {
    const naturalEnd = chunks[i].end;
    const nextStart = chunks[i + 1].start;
    const gap = nextStart - naturalEnd;
    chunks[i].end = gap <= MAX_HOLD_PAUSE_SECONDS ? nextStart : naturalEnd;
  }
  return chunks;
}

export const CanvasCaptions: React.FC<Props> = ({ words, box }) => {
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
  const translateY = interpolate(popIn, [0, 1], [12, 0]);

  const emoji = emojiFor(active.text);
  const width = box.right - box.left;
  const height = box.bottom - box.top;

  return (
    <div
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width,
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 28,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {emoji && (
        <div
          style={{
            fontSize: 64,
            marginBottom: 18,
            lineHeight: 1,
          }}
        >
          {emoji}
        </div>
      )}
      <div
        style={{
          fontFamily,
          fontSize: 50,
          fontWeight: 800,
          lineHeight: 1.18,
          color: "#0F1923",
          letterSpacing: "-0.005em",
        }}
      >
        {active.words.map((w, i) => {
          const isActive = t >= w.start && t < w.end;
          const isEmphasis = EMPHASIS_RE.test(w.word);
          let color = "#0F1923"; // dark slate (default)
          if (isActive) color = "#059669"; // emerald — current word
          else if (isEmphasis) color = "#0E7490"; // teal — keyword
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                margin: "0 0.18em",
                color,
                fontWeight: isActive || isEmphasis ? 900 : 800,
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
