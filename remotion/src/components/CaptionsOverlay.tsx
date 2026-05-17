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

// If TTS pauses longer than this between two consecutive words, force a
// chunk boundary there so the current chunk can disappear during the
// silence. Without this, a long mid-sentence pause kept captions on
// screen while the narrator was silent.
const PAUSE_SPLIT_SECONDS = 0.25;
// How long a chunk may overrun its last word waiting for the next chunk.
// Shorter = tighter sync with audio; longer = less flicker.
const MAX_HOLD_PAUSE_SECONDS = 0.2;

// Visual emphasis: words matching this regex render in yellow (#FFD60A) even
// when not the "active" word. Highlights numbers, percentages, and a curated
// set of urgent/medical keywords that should draw the eye.
const EMPHASIS_RE = /^(\d+%?|\d+(?:st|nd|rd|th)|warning|never|always|secret|hidden|study|research|proven|shocking|dangerous|crucial|critical|deadly|stop|avoid|doctors?|scientists?)[.,!?:;]?$/i;

// Keyword → emoji. If any word in a chunk matches, the emoji renders next to
// the chunk for a moment of personality. First match wins.
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
    // Long pause from the previous word? End the chunk so it disappears.
    if (current.length > 0) {
      const prevEnd = current[current.length - 1].end;
      if (w.start - prevEnd >= PAUSE_SPLIT_SECONDS) flush();
    }
    current.push(w);
    const endsWithStrongPunct = /[.!?]$/.test(w.word);
    if (endsWithStrongPunct || current.length >= MAX_WORDS_PER_CHUNK) flush();
  }
  flush();
  // Smooth tiny gaps between chunks (< MAX_HOLD_PAUSE_SECONDS); leave longer
  // gaps as captions-off pauses matching the narrator's actual silence.
  for (let i = 0; i < chunks.length - 1; i++) {
    const naturalEnd = chunks[i].end;
    const nextStart = chunks[i + 1].start;
    const gap = nextStart - naturalEnd;
    chunks[i].end = gap <= MAX_HOLD_PAUSE_SECONDS ? nextStart : naturalEnd;
  }
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
          {(() => {
            const emoji = emojiFor(active.text);
            return (
              <>
                {emoji && (
                  <span
                    style={{
                      display: "inline-block",
                      marginRight: "0.35em",
                      fontSize: "1.05em",
                    }}
                  >
                    {emoji}
                  </span>
                )}
                {active.words.map((w, i) => {
                  const isActive = t >= w.start && t < w.end;
                  const isEmphasis = EMPHASIS_RE.test(w.word);
                  // Active = yellow (current word). Emphasis = also yellow but with a slight
                  // weight bump. Otherwise white.
                  const color = isActive || isEmphasis ? "#FFD60A" : "#FFFFFF";
                  return (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        margin: "0 0.18em",
                        color,
                        // Slightly bolder for emphasis words even when not active.
                        fontWeight: isEmphasis ? 900 : 800,
                      }}
                    >
                      {w.word}
                    </span>
                  );
                })}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
