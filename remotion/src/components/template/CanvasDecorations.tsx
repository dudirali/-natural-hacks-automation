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
  start: number;
  end: number;
}

interface Props {
  words: Word[];
  /** Caption box bounds — used to position the big chunk icon above the text. */
  captionBox: { left: number; top: number; right: number; bottom: number };
  /** Canvas bounds (between banners) — used to place corner decorations. */
  canvasBox: { left: number; top: number; right: number; bottom: number };
}

// Topic → big floating icon. Same map as captions, picking the FIRST match.
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
  [/fat|weight|belly/i, "⚖️"],
  [/food|eat|meal|breakfast|dinner/i, "🍽️"],
  [/teeth|dental|mouth/i, "🦷"],
  [/study|research|science|scientist/i, "🔬"],
  [/blood|pressure|circulat/i, "🩸"],
];

function emojiFor(text: string): string | null {
  for (const [re, em] of EMOJI_MAP) {
    if (re.test(text)) return em;
  }
  return null;
}

const MAX_WORDS_PER_CHUNK = 7;
const PAUSE_SPLIT_SECONDS = 0.25;

function groupIntoChunks(words: Word[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (!current.length) return;
    chunks.push({
      text: current.map((w) => w.word).join(" "),
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
    if (/[.!?]$/.test(w.word) || current.length >= MAX_WORDS_PER_CHUNK) flush();
  }
  flush();
  return chunks;
}

/**
 * Always-present canvas decorations:
 *   1. Subtle floating shapes in the four corners of the canvas (decorative).
 *   2. A LARGE animated emoji card on the right of the canvas that updates
 *      per active caption chunk — keyed off the same EMOJI_MAP the caption
 *      uses. Sits above the captions and animates in/out with each chunk.
 */
export const CanvasDecorations: React.FC<Props> = ({ words, captionBox, canvasBox }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const chunks = useMemo(() => groupIntoChunks(words), [words]);
  const active = chunks.find((c) => t >= c.start && t < c.end);
  const icon = active ? emojiFor(active.text) : null;

  // Pop-in animation for the chunk icon
  const localFrame = active ? Math.max(0, frame - Math.floor(active.start * fps)) : 0;
  const popIn = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 130 } });
  const iconScale = interpolate(popIn, [0, 1], [0.4, 1]);
  const iconOpacity = interpolate(popIn, [0, 1], [0, 1]);

  // Gentle perpetual float for corner decorations (sine wave)
  const floatY = (offset: number) => Math.sin(t * Math.PI * 0.6 + offset) * 6;

  return (
    <>
      {/* Corner decorations — always visible */}
      <CornerLeaf x={canvasBox.left + 24} y={canvasBox.top + 16 + floatY(0)} color="#A7F3D0" rotate={-18} />
      <CornerSparkle x={canvasBox.right - 56} y={canvasBox.top + 24 + floatY(1.5)} color="#FCD34D" />
      <CornerDots x={canvasBox.left + 28} y={canvasBox.bottom - 64 + floatY(3)} color="#7DD3FC" />
      <CornerLeaf x={canvasBox.right - 56} y={canvasBox.bottom - 56 + floatY(4.5)} color="#86EFAC" rotate={170} />

      {/* Big chunk emoji card above captions */}
      {icon && (
        <div
          style={{
            position: "absolute",
            left: captionBox.left,
            right: 1280 - captionBox.right,
            top: captionBox.top - 8,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            opacity: iconOpacity,
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 30,
              background: "linear-gradient(135deg, #ECFDF5 0%, #DBEAFE 100%)",
              border: "3px solid rgba(15,25,35,0.10)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 78,
              lineHeight: 1,
              boxShadow: "0 10px 24px rgba(15,25,35,0.12)",
              transform: `scale(${iconScale})`,
            }}
          >
            {icon}
          </div>
        </div>
      )}

      {/* Bottom-of-canvas decorative wave to anchor the design */}
      <div
        style={{
          position: "absolute",
          left: canvasBox.left,
          right: 1280 - canvasBox.right,
          bottom: 1280 - canvasBox.bottom + 4,
          height: 4,
          background: "linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.45) 30%, rgba(56,189,248,0.45) 70%, transparent 100%)",
        }}
      />

      {/* Subtle channel watermark in canvas (small) */}
      <div
        style={{
          position: "absolute",
          right: canvasBox.right - 96,
          top: canvasBox.bottom - 22,
          fontFamily,
          fontSize: 14,
          fontWeight: 700,
          color: "rgba(15,25,35,0.35)",
          letterSpacing: "0.08em",
        }}
      >
        @naturalhacks
      </div>
    </>
  );
};

const CornerLeaf: React.FC<{ x: number; y: number; color: string; rotate?: number }> = ({ x, y, color, rotate = 0 }) => (
  <svg
    style={{ position: "absolute", left: x, top: y, transform: `rotate(${rotate}deg)`, opacity: 0.55 }}
    width="48"
    height="48"
    viewBox="0 0 48 48"
    fill="none"
  >
    <path
      d="M 8 40 C 8 24 24 8 40 8 C 40 24 24 40 8 40 Z"
      fill={color}
    />
    <path d="M 8 40 L 40 8" stroke="rgba(15,25,35,0.25)" strokeWidth="1.5" />
  </svg>
);

const CornerSparkle: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <svg style={{ position: "absolute", left: x, top: y, opacity: 0.6 }} width="40" height="40" viewBox="0 0 40 40">
    <path d="M 20 4 L 23 17 L 36 20 L 23 23 L 20 36 L 17 23 L 4 20 L 17 17 Z" fill={color} />
  </svg>
);

const CornerDots: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <svg style={{ position: "absolute", left: x, top: y, opacity: 0.5 }} width="50" height="40" viewBox="0 0 50 40">
    <circle cx="8" cy="8" r="4" fill={color} />
    <circle cx="26" cy="14" r="3" fill={color} opacity="0.7" />
    <circle cx="42" cy="22" r="5" fill={color} opacity="0.85" />
    <circle cx="14" cy="30" r="2.5" fill={color} opacity="0.6" />
    <circle cx="34" cy="34" r="3.5" fill={color} opacity="0.75" />
  </svg>
);
